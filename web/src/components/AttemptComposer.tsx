"use client";

import { useEffect, useRef, useState } from "react";
import { CONTRACT_ADDRESS, getReadClient, getWriteClient, requestWalletAccount } from "@/lib/genlayer";
import { formatGen, truncateAddress } from "@/lib/format";
import { Button, SectionCard, VerdictBadge } from "@/components/ui";

const MAX_LEN = 1000;

// Not importing a TransactionStatus enum here - genlayer-js 1.1.8 doesn't
// re-export it from its public entry point despite using it in its own
// type signatures (see scripts/deploy.ts for the same finding). Using the
// raw string value instead.
const FINALIZED = "FINALIZED";

type Stage = "idle" | "connecting" | "submitting" | "waiting" | "done" | "error";

type Result = { verdict: boolean; reason: string; confirmed: boolean };

async function fetchLatestAttempt(readClient: ReturnType<typeof getReadClient>) {
  // The read RPC node can lag a beat behind a just-accepted write, so retry a
  // few times rather than risk showing a stale (or missing) record.
  for (let i = 0; i < 4; i++) {
    const attempts = (await readClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "get_attempts",
      args: [0, 1],
    })) as { verdict: boolean; reason: string; timestamp: string }[];
    if (attempts[0]) return attempts[0];
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
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
  const [result, setResult] = useState<Result | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

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
      // ACCEPTED (the default here) - that's typically seconds, not the
      // ~30+ minutes full FINALIZED can take once the appeal window is
      // included. Show that provisional result right away rather than
      // making people stare at a spinner, then quietly confirm finality in
      // the background.
      await client.waitForTransactionReceipt({ hash: txHash });

      const readClient = getReadClient();
      const latest = await fetchLatestAttempt(readClient);

      setResult(latest ? { ...latest, confirmed: false } : null);
      setMessage("");
      setStage("done");
      if (latest) onAttemptResult?.(latest.verdict);
      onSettled();

      client
        .waitForTransactionReceipt({ hash: txHash, status: FINALIZED as any, interval: 15000, retries: 240 })
        .then(async () => {
          const final = await fetchLatestAttempt(readClient);
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

          {(stage === "submitting" || stage === "waiting") && (
            <p className="text-xs text-slate-500">
              Every validator is independently judging your message right now - this
              usually takes well under a minute, not the full on-chain finality window.
            </p>
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
                    provisional - confirming on-chain finality...
                  </span>
                )}
              </div>
              <p className="text-lg text-slate-300">{result.reason}</p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
