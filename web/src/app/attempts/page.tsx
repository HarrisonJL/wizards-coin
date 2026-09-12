"use client";

import { useCallback, useEffect, useState } from "react";
import { isConfigured, fetchAttempts, type Attempt } from "@/lib/useVaultState";
import { formatGen, timeAgo, truncateAddress } from "@/lib/format";
import { SectionCard, VerdictBadge, Button } from "@/components/ui";

const PAGE_SIZE = 10;

export default function AttemptsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    try {
      const page = await fetchAttempts(nextOffset, PAGE_SIZE);
      setAttempts((prev) => (nextOffset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
      setOffset(nextOffset + page.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attempts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured()) {
      setLoading(false);
      return;
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isConfigured()) {
    return (
      <SectionCard title="Not configured">
        <p className="text-sm text-slate-400">
          Set <code className="text-amber-400">NEXT_PUBLIC_CONTRACT_ADDRESS</code> and reload.
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-pixel text-lg leading-relaxed text-[color:var(--gold)]">Attempt Log</h1>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {attempts.length === 0 && !loading ? (
        <p className="text-sm text-slate-500">No attempts yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {attempts.map((a, i) => (
            <SectionCard key={`${a.sender}-${a.timestamp}-${i}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={a.verdict} />
                  <span className="font-mono text-xs text-slate-400">
                    {truncateAddress(a.sender)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{formatGen(a.fee_paid)} GEN</span>
                  <span>{timeAgo(a.timestamp)}</span>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">{a.message}</p>
              <p className="mt-2 text-xs text-slate-500">{a.reason}</p>
            </SectionCard>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => load(offset)} loading={loading}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
