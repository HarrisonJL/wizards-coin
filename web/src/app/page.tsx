"use client";

import { useEffect, useRef, useState } from "react";
import { isConfigured, useVaultState, fetchGuardPrompt } from "@/lib/useVaultState";
import { formatGen, timeAgo, truncateAddress } from "@/lib/format";
import { SectionCard, StatCard } from "@/components/ui";
import AttemptComposer from "@/components/AttemptComposer";
import GuardPromptPanel, { type GuardPromptHandle } from "@/components/GuardPromptPanel";
import PixelWizard from "@/components/PixelWizard";
import PotOfGold from "@/components/pixel/PotOfGold";

export default function HomePage() {
  const { state, error, loading, refresh, hasWinner } = useVaultState();
  const [prompt, setPrompt] = useState<string | null>(null);
  const lockRef = useRef<GuardPromptHandle>(null);

  useEffect(() => {
    if (!isConfigured()) return;
    fetchGuardPrompt()
      .then(setPrompt)
      .catch(() => setPrompt(null));
  }, []);

  if (!isConfigured()) {
    return (
      <SectionCard title="Not configured">
        <p className="text-sm text-slate-400">
          Set <code className="text-amber-400">NEXT_PUBLIC_CONTRACT_ADDRESS</code> (and{" "}
          <code className="text-amber-400">NEXT_PUBLIC_GENLAYER_CHAIN</code> if not localnet)
          in <code className="text-amber-400">.env.local</code> and reload.
        </p>
      </SectionCard>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading vault state...</p>;
  }

  if (error || !state) {
    return (
      <SectionCard title="Couldn&apos;t load the vault">
        <p className="text-sm text-red-400">{error}</p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="pixel-panel flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-center sm:text-left">
        <div className="flex items-end gap-1">
          <PixelWizard size={96} fierce />
          <PotOfGold size={72} className="mb-1" />
        </div>
        <div>
          <h1 className="font-pixel text-xl leading-relaxed text-[color:var(--gold)] sm:text-2xl">
            THE GUARDIAN AWAITS
          </h1>
          <p className="mt-2 max-w-md text-lg text-slate-300">
            Talk your way past the vault, if you can. Every argument is judged
            independently by a whole jury of validators, not just one wizard.
          </p>
        </div>
      </div>

      {hasWinner && (
        <div className="pixel-panel border-[color:var(--gold)] p-4">
          <p className="font-pixel text-xs leading-relaxed text-[color:var(--gold)]">
            THE VAULT HAS BEEN WON BY {truncateAddress(state.winner)}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Prize pool" value={`${formatGen(state.prize_pool)} GEN`} />
        <StatCard label="Current fee" value={`${formatGen(state.attempt_fee)} GEN`} />
        <StatCard label="Attempts" value={state.attempt_count.toString()} />
        <StatCard
          label="Last attempt"
          value={state.attempt_count > 0 ? timeAgo(state.last_attempt_time) : "—"}
        />
      </div>

      <AttemptComposer
        attemptFee={state.attempt_fee}
        isOpen={state.is_open}
        onSettled={refresh}
        onAttemptStart={() => lockRef.current?.playAttempt()}
        onAttemptResult={(verdict) =>
          verdict ? lockRef.current?.playReleased() : lockRef.current?.playDenied()
        }
        onAttemptError={() => lockRef.current?.playIdle()}
      />

      <GuardPromptPanel
        ref={lockRef}
        prompt={prompt}
        hash={state.guard_prompt_hash}
        initiallyWon={hasWinner}
      />
    </div>
  );
}
