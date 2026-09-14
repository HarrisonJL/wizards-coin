export type Progress = { statusName: string; validators: string[]; votes: string[]; leader: string | null };

export type Tally = { agree: number; disagree: number; unrevealed: number; total: number };

// A validator with no vote yet (or whose vote hasn't reached this read) is
// unrevealed, not an implicit "agree" - a previous version defaulted an
// incomplete votes array to "everyone agreed", which overstates consensus
// exactly when it's least justified (still-resolving or partially-revealed
// rounds). Indexing past votes.length naturally falls into `undefined`,
// which is treated as unrevealed the same as an explicit empty string.
export function tally(progress: Progress | null): Tally {
  const total = progress?.validators.length ?? 0;
  let agree = 0;
  let disagree = 0;
  let unrevealed = 0;
  for (let i = 0; i < total; i++) {
    const v = progress?.votes[i];
    if (v === "AGREE") agree++;
    else if (v === "DISAGREE") disagree++;
    else unrevealed++;
  }
  return { agree, disagree, unrevealed, total };
}
