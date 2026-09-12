"use client";

import { useEffect, useRef, useState } from "react";
import { CONTRACT_ADDRESS, getWriteClient, requestWalletAccount } from "@/lib/genlayer";
import { fetchAttempts } from "@/lib/useVaultState";
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

type Result = { verdict: boolean; reason: string; confirmed: boolean };

function voteBadge(vote: string): { symbol: string; className: string } {
  if (vote === "AGREE") return { symbol: "✓", className: "text-emerald-400" };
  if (vote === "DISAGREE") return { symbol: "✗", className: "text-[color:var(--magenta)]" };
  if (!vote) return { symbol: "…", className: "text-slate-600" };
  return { symbol: "?", className: "text-slate-500" };
}

function tally(progress: Progress | null) {
  const total = progress?.validators.length ?? 0;
  if (!progress || progress.votes.length !== total) {
    // Votes not fully revealed yet - don't claim a split we can't verify.
    return { agree: total, disagree: 0, total };
  }
  let agree = 0;
  let disagree = 0;
  progress.votes.forEach((v) => {
    if (v === "AGREE") agree++;
    else if (v === "DISAGREE") disagree++;
  });
  return { agree, disagree, total };
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

// votes[i] corresponds to validators[i] - "AGREE" means that validator
// independently computed the same result as the leader (i.e. sided with
// the final verdict), "DISAGREE" means it computed something else, empty
// string means not revealed yet. Real per-validator data straight off the
// transaction's own consensus round, not synthesized.
type Progress = { statusName: string; validators: string[]; votes: string[]; leader: string | null };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestAttempt() {
  // The read RPC node can lag a beat behind a just-accepted write, so retry a
  // few times rather than risk showing a stale (or missing) record. Goes
  // through the shared fetchAttempts() rather than a second ad-hoc
  // readContract call, so the u256-fields-come-back-as-strings handling
  // there (see useVaultState.ts) only has to exist in one place.
  for (let i = 0; i < 4; i++) {
    const attempts = await fetchAttempts(0, 1);
    if (attempts[0]) return attempts[0];
    await sleep(1500);
  }
  return null;
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

  async function submit() {
    if (!account || attemptFee === null) return;
    setStage("submitting");
    setError(null);
    setResult(null);
    setProgress(null);
    submittedMessageRef.current = message;
    onAttemptStart?.();
    try {
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
      // take once the appeal window is included. Show that provisional
      // result as soon as it lands, then quietly confirm finality after.
      await pollTransaction(client, txHash, "ACCEPTED", setProgress, () => !mountedRef.current);

      const latest = await fetchLatestAttempt();

      setResult(latest ? { ...latest, confirmed: false } : null);
      setMessage("");
      setStage("done");
      if (latest) {
        onAttemptResult?.(latest.verdict);
        setShowResultScreen(true);
      }
      onSettled();

      pollTransaction(client, txHash, "FINALIZED", setProgress, () => !mountedRef.current)
        .then(async () => {
          const final = await fetchLatestAttempt();
          if (!mountedRef.current || !final) return;
          setResult({ ...final, confirmed: true });
          if (latest && final.verdict !== latest.verdict) {
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

  return (
    <>
      {showResultScreen && result && (
        <ResultOverlay
          verdict={result.verdict}
          witnessCount={progress?.validators.length || 5}
          agreeCount={tally(progress).agree}
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

          {result && (
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
                    {tally(progress).agree} of {tally(progress).total} validators sided with this verdict
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
