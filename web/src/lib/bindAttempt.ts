import { fetchVaultState, fetchAttempts, type Attempt } from "@/lib/useVaultState";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BindResult =
  | { kind: "bound"; attempt: Attempt }
  // attempt_count never increased past beforeCount - covers a validator
  // timeout/appeal rollback where the transaction was accepted at the
  // consensus layer but attempt()'s own bookkeeping never ran (the
  // "stranded fee" case sweep() exists for) or a rollback removed the
  // record entirely. There is no verdict to bind, and none should be shown.
  | { kind: "no_new_record" }
  // attempt_count increased but none of the newly-appended records match
  // this sender+message - shouldn't happen for a correctly-submitted
  // attempt, but fails safe rather than falling back to "latest".
  | { kind: "unmatched" };

// Matches by sender AND exact message text against only the records
// appended since this submission started (newAttemptsNewestFirst), never
// against the whole history - "latest attempt" is not the same thing as
// "this attempt", and conflating them is exactly the bug this guards
// against: a concurrent attempt from a different wallet landing after ours
// must never be displayed as our own result.
export function findBoundAttempt(
  newAttemptsNewestFirst: Attempt[],
  sender: string,
  message: string
): Attempt | null {
  const senderLower = sender.toLowerCase();
  return (
    newAttemptsNewestFirst.find(
      (a) => a.sender.toLowerCase() === senderLower && a.message === message
    ) ?? null
  );
}

export function bindAttemptFromDelta(
  beforeCount: number,
  afterCount: number,
  recentAttemptsNewestFirst: Attempt[],
  sender: string,
  message: string
): BindResult {
  const delta = afterCount - beforeCount;
  if (delta <= 0) return { kind: "no_new_record" };
  const candidates = recentAttemptsNewestFirst.slice(0, delta);
  const match = findBoundAttempt(candidates, sender, message);
  return match ? { kind: "bound", attempt: match } : { kind: "unmatched" };
}

// Real I/O wrapper around bindAttemptFromDelta - retries briefly for read-
// node lag (get_attempts(0, N) right after a just-accepted write can be a
// beat behind), but never falls back to "just show whatever's newest".
export async function resolveBoundAttempt(
  beforeCount: number,
  sender: string,
  message: string,
  retries = 4,
  retryDelayMs = 1500
): Promise<BindResult> {
  for (let i = 0; i < retries; i++) {
    const state = await fetchVaultState();
    const afterCount = state.attempt_count;
    if (afterCount > beforeCount) {
      const recent = await fetchAttempts(0, afterCount - beforeCount);
      return bindAttemptFromDelta(beforeCount, afterCount, recent, sender, message);
    }
    if (i < retries - 1) await sleep(retryDelayMs);
  }
  return { kind: "no_new_record" };
}
