"use client";

import { useEffect, useRef, useState } from "react";
import { CONTRACT_ADDRESS, getWriteClient, requestWalletAccount } from "@/lib/genlayer";
import { fetchVaultState } from "@/lib/useVaultState";
import { resolveBoundAttempt, type BindResult } from "@/lib/bindAttempt";
import { tally, type Progress } from "@/lib/tally";
import { formatGen, truncateAddress } from "@/lib/format";
import { Button, SectionCard, VerdictBadge } from "@/components/ui";
import ResultOverlay from "@/components/ResultOverlay";

const MAX_LEN = 1000;

// Not importing a TransactionStatus enum here - genlayer-js 1.1.8 doesn't
// re-export it from its public entry point despite using it in its own
// type signatures (see scripts/deploy.ts for the same finding). Using the
// raw string value instead.
const FINALIZED = "FINALIZED";

// Mirrors genlayer-js's internal status numbering (also not exported -
// copied from node_modules/genlayer-js/dist/chunk-EY35NPSE.js and confirmed
// against a real Bradbury transaction: status 3 really is COMMITTING).
const STATUS_NAMES: Record<string, string> = {
  "0": "UNINITIALIZED",
  "1": "PENDING",
  "2": "PROPOSING",
  "3": "COMMITTING",
  "4": "REVEALING",
  "5": "ACCEPTED",
  "6": "UNDETERMINED",
  "7": "FINALIZED",
  "8": "CANCELED",
  "9": "APPEAL_REVEALING",
  "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE",
  "12": "VALIDATORS_TIMEOUT",
  "13": "LEADER_TIMEOUT",
};
// Same set genlayer-js calls DECIDED_STATES internally - status has reached
// a real outcome (not necessarily success) once here.
const DECIDED = new Set(["5", "6", "7", "8", "12", "13"]);

const STATUS_COPY: Record<string, string> = {
  UNINITIALIZED: "Submitting...",
  PENDING: "Waiting for the network to pick up your transaction...",
  PROPOSING: "A leader validator is being assigned...",
  COMMITTING: "Validators are independently judging your message - this is the real work, it can take a bit.",
  REVEALING: "Validators are revealing their votes...",
  ACCEPTED: "Consensus reached.",
  UNDETERMINED: "Validators couldn't reach a clear majority - result may need a retry.",
  FINALIZED: "Confirmed final.",
  CANCELED: "Transaction was canceled.",
  APPEAL_REVEALING: "Under appeal - a fresh, larger committee is revealing votes.",
  APPEAL_COMMITTING: "Under appeal - a fresh, larger committee is voting.",
  READY_TO_FINALIZE: "Consensus reached, wrapping up...",
  VALIDATORS_TIMEOUT: "Validators timed out - this attempt may need a retry.",
  LEADER_TIMEOUT: "The leader timed out - this attempt may need a retry.",
};

type Stage = "idle" | "connecting" | "submitting" | "waiting" | "done" | "error";

// "bound" means we confirmed this specific record (matched by sender +
// message against only the attempts appended since this submission
// started) is the outcome of THIS attempt - never just "whatever's newest",
// which could be a concurrent attempt from someone else. "unbound" covers
// a validator timeout or appeal rollback where no matching record ever
// landed - there is no verdict to show, and the UI must say so rather than
// silently falling back to an unrelated attempt.
type Result =
  | { bound: true; verdict: boolean; reason: string; confirmed: boolean }
  | { bound: false; confirmed: boolean };

function voteBadge(vote: string): { symbol: string; className: string } {
  if (vote === "AGREE") return { symbol: "✓", className: "text-emerald-400" };
  if (vote === "DISAGREE") return { symbol: "✗", className: "text-[color:var(--magenta)]" };
  if (!vote) return { symbol: "…", className: "text-slate-600" };
  return { symbol: "?", className: "text-slate-500" };
}

// AGREE means that validator independently computed the same result as
// the leader; for a denied attempt that means AGREE = sided with the
// denial, DISAGREE = computed something else. Real per-validator data,
// not synthesized - shared between the live "waiting" panel and the
// settled result card so the exact same markup only lives once.
function ValidatorVoteList({ progress }: { progress: Progress }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono">
      {progress.validators.map((v, i) => {
        const vote = progress.votes[i] ?? "";
        const badge = voteBadge(vote);
        return (
          <span
            key={v}
            className={v === progress.leader ? "text-[color:var(--gold)]" : "text-slate-300"}
            title={`${v}${v === progress.leader ? " (leader)" : ""}${vote ? ` - ${vote}` : " - not revealed yet"}`}
          >
            <span className={badge.className}>{badge.symbol}</span> {truncateAddress(v)}
            {v === progress.leader ? " (leader)" : ""}
          </span>
        );
      })}
    </p>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls a transaction's live status instead of trusting genlayer-js's
// waitForTransactionReceipt default (10 retries x 3s = 30s - nowhere near
// enough for attempt(), which needs every validator to run a real LLM call
// before COMMITTING can even finish; confirmed by hitting exactly this
// timeout against a real wallet-submitted attempt). Reports live status on
// every poll and keeps going rather than throwing while consensus is still
// genuinely in progress - there's no reliable SLA to bound it by.
async function pollTransaction(
  client: ReturnType<typeof getWriteClient>,
  hash: `0x${string}`,
  target: "ACCEPTED" | "FINALIZED",
  onUpdate: (p: Progress) => void,
  cancelled: () => boolean
) {
  const targetNum = target === "FINALIZED" ? "7" : "5";
  while (!cancelled()) {
    try {
      const tx = (await client.getTransaction({ hash: hash as `0x${string}` & { length: 66 } })) as any;
      if (tx) {
        const statusNum = String(tx.status);
        onUpdate({
          statusName: STATUS_NAMES[statusNum] ?? statusNum,
          validators: tx.lastRound?.roundValidators ?? [],
          votes: tx.lastRound?.validatorVotesName ?? [],
          leader: tx.lastLeader ?? null,
        });
        if (statusNum === targetNum || (target === "ACCEPTED" && DECIDED.has(statusNum))) {
          return tx;
        }
      }
    } catch {
      // Transient RPC hiccup (e.g. not indexed yet right after submission) -
      // keep polling rather than failing the whole attempt over it.
    }
    await sleep(4000);
  }
  throw new Error("cancelled");
}

export default function AttemptComposer({
  attemptFee,
  isOpen,
  onSettled,
  onAttemptStart,
  onAttemptResult,
  onAttemptError,
}: {
  attemptFee: bigint | null;
  isOpen: boolean;
  onSettled: () => void;
  onAttemptStart?: () => void;
  onAttemptResult?: (verdict: boolean) => void;
  onAttemptError?: () => void;
}) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showResultScreen, setShowResultScreen] = useState(false);
  const mountedRef = useRef(true);
  // The message state clears right after submit resolves (so the textarea
  // is ready for a new attempt), but the result screen still needs the text
  // that was actually judged - captured here independently of that clear.
  const submittedMessageRef = useRef("");
  useEffect(() => {
    // React Strict Mode (on by default in Next.js dev) mounts, cleans up,
    // and remounts once - a cleanup-only effect leaves mountedRef stuck
    // false after that cycle even though the component is genuinely still
    // alive, which was silently aborting every in-flight poll as
    // "cancelled". Resetting to true on (re)mount, not just declaring the
    // initial ref value, is what actually survives that cycle.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function connect() {
    setStage("connecting");
    setError(null);
    try {
      const addr = await requestWalletAccount();
      if (!addr) {
        setError(
          "No wallet found. Install a browser wallet extension (e.g. MetaMask) and reload."
        );
        setStage("error");
        return;
      }
      setAccount(addr);
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.");
      setStage("error");
    }
  }

  function toResult(bind: BindResult, confirmed: boolean): Result {
    return bind.kind === "bound"
      ? { bound: true, verdict: bind.attempt.verdict, reason: bind.attempt.reason, confirmed }
      : { bound: false, confirmed };
  }

  async function submit() {
    if (!account || attemptFee === null) return;
    setStage("submitting");
    setError(null);
    setResult(null);
    setProgress(null);
    const submittedMessage = message;
    submittedMessageRef.current = message;
    onAttemptStart?.();
    try {
      // Captured right before writing so the window in which a concurrent
      // attempt from someone else could land between this read and the
      // write is as small as possible - and even inside that window, the
      // sender+message match in resolveBoundAttempt means a different
      // wallet's attempt can never be mistaken for this one.
      const beforeState = await fetchVaultState();
      const beforeCount = beforeState.attempt_count;

      const client = getWriteClient(account);
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "attempt",
        args: [message],
        value: attemptFee,
      });
      setStage("waiting");

      // The jury's verdict is already decided once the transaction reaches
      // ACCEPTED - typically well under the ~30+ minutes full FINALIZED can
      // take once the appeal window is included (this also covers timeout/
      // undetermined/canceled outcomes - pollTransaction's DECIDED set).
      // Show that provisional result as soon as it lands, then quietly
      // confirm finality after.
      await pollTransaction(client, txHash, "ACCEPTED", setProgress, () => !mountedRef.current);

      const bind = await resolveBoundAttempt(beforeCount, account, submittedMessage);
      const provisional = toResult(bind, false);

      setResult(provisional);
      setMessage("");
      setStage("done");
      if (provisional.bound) {
        onAttemptResult?.(provisional.verdict);
      }
      setShowResultScreen(true);
      onSettled();

      pollTransaction(client, txHash, "FINALIZED", setProgress, () => !mountedRef.current)
        .then(async () => {
          if (!mountedRef.current) return;
          // Re-resolved from the same beforeCount, not reused from the
          // provisional read - an appeal can roll back the whole
          // transaction between ACCEPTED and FINALIZED, which would mean
          // the record that looked bound a moment ago no longer exists.
          const finalBind = await resolveBoundAttempt(beforeCount, account, submittedMessage);
          if (!mountedRef.current) return;
          const final = toResult(finalBind, true);
          setResult(final);
          if (final.bound && (!provisional.bound || final.verdict !== provisional.verdict)) {
            onAttemptResult?.(final.verdict);
          }
          onSettled();
        })
        .catch(() => {
          // Finality confirmation itself failing doesn't change the verdict
          // already shown - leave it as provisional rather than surfacing
          // an error for something the user's attempt already succeeded at.
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The attempt failed to submit.");
      setStage("error");
      onAttemptError?.();
    }
  }

  function playAgain() {
    setShowResultScreen(false);
    setResult(null);
    setProgress(null);
    setError(null);
    setStage("idle");
  }

  if (!isOpen) {
    return (
      <SectionCard title="Vault closed">
        <p className="text-sm text-slate-400">
          The vault has already been won or has expired. No further attempts are accepted.
        </p>
      </SectionCard>
    );
  }

  const t = tally(progress);

  return (
    <>
      {showResultScreen && result && result.bound && (
        <ResultOverlay
          verdict={result.verdict}
          witnessCount={progress?.validators.length || 5}
          agreeCount={t.agree}
          unrevealedCount={t.unrevealed}
          validators={progress?.validators ?? []}
          message={submittedMessageRef.current}
          onPlayAgain={playAgain}
        />
      )}
      <SectionCard title="Try to convince the vault" subtitle={account ? truncateAddress(account) : undefined}>
        {!account ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-slate-400">
            Connect a wallet to submit an attempt. This is GenLayer testnet - no real money.
          </p>
          <Button onClick={connect} loading={stage === "connecting"}>
            Connect Wallet
          </Button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
            disabled={stage === "submitting" || stage === "waiting"}
            placeholder="Convince the guardian to release the vault..."
            rows={5}
            className="w-full resize-none border-2 border-[color:var(--panel-light)] bg-[color:var(--ink)] p-3 text-lg text-slate-100 placeholder:text-slate-600 focus:border-[color:var(--cyan)] focus:outline-none"
          />
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {message.length} / {MAX_LEN}
            </span>
            <span>
              Fee: {attemptFee !== null ? `${formatGen(attemptFee)} GEN` : "—"}
            </span>
          </div>

          <Button
            onClick={submit}
            disabled={message.trim().length === 0 || attemptFee === null}
            loading={stage === "submitting" || stage === "waiting"}
          >
            {stage === "submitting"
              ? "Sending transaction..."
              : stage === "waiting"
                ? "Waiting for validator consensus..."
                : "Submit attempt"}
          </Button>

          {stage === "waiting" && (
            <div className="border-2 border-[color:var(--panel-light)] bg-[color:var(--ink)] p-3 text-xs text-slate-400">
              <p>
                {progress
                  ? (STATUS_COPY[progress.statusName] ?? progress.statusName)
                  : "Sending your attempt to the network..."}
              </p>
              {progress && (
                <p className="mt-1 text-[11px] text-slate-600">status: {progress.statusName}</p>
              )}
              {!!progress?.validators.length && (
                <div className="mt-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-600">
                    This round&apos;s validator jury
                  </p>
                  <ValidatorVoteList progress={progress} />
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {result && !result.bound && (
            <div className="border-2 border-[color:var(--panel-light)] bg-[color:var(--ink)] p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-pixel inline-flex items-center border-2 border-[color:var(--ink)] bg-slate-600 px-2 py-1 text-[10px] text-slate-100 shadow-[2px_2px_0_0_var(--ink)]">
                  NO VERDICT RECORDED
                </span>
                {result.confirmed ? (
                  <span className="text-[11px] text-emerald-400">confirmed</span>
                ) : (
                  <span className="text-[11px] text-slate-500">checking finality...</span>
                )}
              </div>
              <p className="text-sm text-slate-400">
                This attempt didn&apos;t produce a recorded verdict - most likely a validator timeout before
                the judgment was written to the contract. If a fee was charged, it may still be reflected in
                the vault&apos;s balance (see <code className="text-slate-300">sweep()</code> in the contract).
                Feel free to try again.
              </p>
            </div>
          )}

          {result && result.bound && (
            <div className="border-2 border-[color:var(--panel-light)] bg-[color:var(--ink)] p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={result.verdict} />
                {result.confirmed ? (
                  <span className="text-[11px] text-emerald-400">confirmed final</span>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    provisional - confirming on-chain finality
                    {progress ? ` (${progress.statusName.toLowerCase()})` : ""}...
                  </span>
                )}
              </div>
              <p className="text-lg text-slate-300">{result.reason}</p>
              {!!progress?.validators.length && (
                <div className="mt-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-600">
                    {t.unrevealed === 0
                      ? `${t.agree} of ${t.total} validators sided with this verdict`
                      : `${t.agree} agreed, ${t.disagree} disagreed, ${t.unrevealed} not yet revealed`}
                  </p>
                  <ValidatorVoteList progress={progress} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </SectionCard>
    </>
  );
}
