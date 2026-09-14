import { describe, expect, it } from "vitest";
import { tally, type Progress } from "@/lib/tally";

function progress(votes: string[], validatorCount = votes.length): Progress {
  return {
    statusName: "REVEALING",
    validators: Array.from({ length: validatorCount }, (_, i) => `0xvalidator${i}`),
    votes,
    leader: "0xvalidator0",
  };
}

describe("tally", () => {
  it("counts a fully revealed unanimous round correctly", () => {
    const t = tally(progress(["AGREE", "AGREE", "AGREE", "AGREE", "AGREE"]));
    expect(t).toEqual({ agree: 5, disagree: 0, unrevealed: 0, total: 5 });
  });

  it("counts a fully revealed split round correctly", () => {
    const t = tally(progress(["AGREE", "AGREE", "AGREE", "DISAGREE", "DISAGREE"]));
    expect(t).toEqual({ agree: 3, disagree: 2, unrevealed: 0, total: 5 });
  });

  // This is the exact bug reported: a short/empty votes array (round still
  // resolving, or the read landed between COMMITTING and REVEALING) must
  // not be reported as everyone agreeing - each missing slot is unrevealed.
  it("treats a not-yet-revealed round as unrevealed, not as agreement", () => {
    const t = tally(progress([], 5));
    expect(t).toEqual({ agree: 0, disagree: 0, unrevealed: 5, total: 5 });
  });

  it("treats a partially revealed round as a mix, not a full agree default", () => {
    const t = tally(progress(["AGREE", "DISAGREE"], 5));
    expect(t).toEqual({ agree: 1, disagree: 1, unrevealed: 3, total: 5 });
  });

  it("treats an explicit empty-string vote the same as a missing one", () => {
    const t = tally(progress(["AGREE", "", "AGREE", "", "AGREE"]));
    expect(t).toEqual({ agree: 3, disagree: 0, unrevealed: 2, total: 5 });
  });

  it("handles null progress as fully unrevealed with zero total", () => {
    const t = tally(null);
    expect(t).toEqual({ agree: 0, disagree: 0, unrevealed: 0, total: 0 });
  });
});
