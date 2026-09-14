import { describe, expect, it } from "vitest";
import { bindAttemptFromDelta, findBoundAttempt } from "@/lib/bindAttempt";
import type { Attempt } from "@/lib/useVaultState";

const ME = "0xAAAA000000000000000000000000000000AAAA";
const SOMEONE_ELSE = "0xBBBB000000000000000000000000000000BBBB";

function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sender: ME,
    message: "please release the vault",
    verdict: false,
    reason: "not convinced",
    fee_paid: 1n,
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("findBoundAttempt", () => {
  it("matches on sender and exact message", () => {
    const mine = makeAttempt();
    const found = findBoundAttempt([mine], ME, "please release the vault");
    expect(found).toBe(mine);
  });

  it("matches sender case-insensitively (checksummed vs lowercase)", () => {
    const mine = makeAttempt({ sender: ME.toLowerCase() });
    const found = findBoundAttempt([mine], ME, "please release the vault");
    expect(found).toBe(mine);
  });

  it("does not match a record from a different sender, even with the same message", () => {
    const someoneElses = makeAttempt({ sender: SOMEONE_ELSE });
    const found = findBoundAttempt([someoneElses], ME, "please release the vault");
    expect(found).toBeNull();
  });

  it("does not match a record with different message text from the same sender", () => {
    const different = makeAttempt({ message: "a completely different attempt" });
    const found = findBoundAttempt([different], ME, "please release the vault");
    expect(found).toBeNull();
  });
});

describe("bindAttemptFromDelta", () => {
  it("binds to the correct record when a concurrent attempt from someone else landed on top", () => {
    // This is the concurrent-attempt case from the review: two attempts
    // landed since beforeCount, someone else's is newest (index 0), ours is
    // right behind it. "Just take get_attempts(0,1)" would show their
    // verdict as ours - the fix must find ours specifically.
    const theirs = makeAttempt({ sender: SOMEONE_ELSE, message: "their message", verdict: true, reason: "granted" });
    const mine = makeAttempt({ verdict: false, reason: "denied" });
    const result = bindAttemptFromDelta(10, 12, [theirs, mine], ME, "please release the vault");
    expect(result).toEqual({ kind: "bound", attempt: mine });
  });

  it("reports no_new_record when the attempt count never increased (validator timeout / stranded fee)", () => {
    // This is the timeout case from the review: the transaction reached a
    // decided status at the consensus layer, but attempt()'s own
    // bookkeeping never ran, so attempt_count is unchanged. Must not fall
    // back to showing whatever the pre-existing "latest" attempt was.
    const result = bindAttemptFromDelta(10, 10, [makeAttempt()], ME, "please release the vault");
    expect(result).toEqual({ kind: "no_new_record" });
  });

  it("reports no_new_record when the count went backwards (appeal rollback)", () => {
    const result = bindAttemptFromDelta(10, 9, [], ME, "please release the vault");
    expect(result).toEqual({ kind: "no_new_record" });
  });

  it("only searches within the delta window, not the whole history", () => {
    // Three attempts landed since beforeCount but only the first two are
    // "new" by the count delta - an old coincidental match further back
    // must not be picked up.
    const newer2 = makeAttempt({ message: "newer 2" });
    const newer1 = makeAttempt({ message: "newer 1" });
    const stale = makeAttempt({ message: "please release the vault" }); // matches, but outside the delta
    const result = bindAttemptFromDelta(10, 12, [newer2, newer1, stale], ME, "please release the vault");
    expect(result).toEqual({ kind: "unmatched" });
  });

  it("reports unmatched when the count increased but nothing in the delta window matches", () => {
    const theirs = makeAttempt({ sender: SOMEONE_ELSE, message: "their message" });
    const result = bindAttemptFromDelta(10, 11, [theirs], ME, "please release the vault");
    expect(result).toEqual({ kind: "unmatched" });
  });
});
