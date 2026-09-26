// lib/goalCalc.ts
// Pure functions — no DB access. Shared by:
//  - lib/actions/goal-actions.ts (writes an initial sets/reps/weight onto
//    every occurrence in a chain the moment a Goal is saved, using only the
//    baseline anchor since no logs exist yet)
//  - getGoalPrescription (walks REAL logged sets to compute where the
//    client actually is right now)
// Kept in one place so "how a block turns into a weight" is never
// duplicated and can't drift between save-time and read-time.

export type WorkingBlock = { type: "working"; target: "reps" | "weight"; min?: number; max?: number; fixedWeight?: number; sets: number };
export type DeloadBlock = { type: "deload"; min: number; max: number; intensity: number; sets: number };
export type RetestBlock = { type: "retest"; sets?: number };
export type GoalBlockDef = WorkingBlock | DeloadBlock | RetestBlock;

export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function roundToHalf(w: number): number {
  return Math.round(w * 2) / 2;
}

export function blockForOccurrence(blocks: GoalBlockDef[], occurrenceIndex: number): GoalBlockDef {
  return blocks[occurrenceIndex % blocks.length];
}

// A prescription given only an anchor value (no live logs) — used to give
// a goal-linked row a sane sets/reps/weight the moment the Goal is saved,
// before anyone has logged anything against it yet.
export function staticPrescription(block: GoalBlockDef, anchor: number | null) {
  if (block.type === "retest") {
    return { sets: block.sets ?? 1, reps: null as number | null, weight: null as number | null };
  }
  if (block.type === "deload") {
    const weight = anchor ? roundToHalf(anchor * (block.intensity / 100)) : null;
    const midReps = Math.round((block.min + block.max) / 2);
    return { sets: block.sets, reps: midReps, weight };
  }
  // working
  if (block.target === "weight") {
    return { sets: block.sets, reps: null as number | null, weight: block.fixedWeight ?? null };
  }
  const min = block.min ?? 5, max = block.max ?? 7;
  const mid = Math.round((min + max) / 2);
  const weight = anchor ? roundToHalf(anchor / (1 + mid / 30)) : null;
  return { sets: block.sets, reps: mid, weight };
}

// Walks occurrences 0..targetIndex-1 to compute the anchor going INTO
// targetIndex, from real logged sets:
//  - working block: anchor = best (highest) e1RM among that occurrence's
//    logged sets (not the last one) — a strong early set never gets
//    erased by a weaker later one in the same occurrence.
//  - deload block: never updates the anchor — it's recovery, not data.
//  - retest block: replaces the anchor outright with that one effort.
//  - an occurrence with NO logged sets at all leaves the anchor
//    unchanged (nothing to calculate from) — a PARTIALLY logged
//    occurrence still counts, using whatever sets exist.
export function computeAnchorForOccurrence(
  occurrences: { loggedSets: { weight: number | null; reps: number | null }[] }[],
  blocks: GoalBlockDef[],
  baselineAnchor: number,
  targetIndex: number
): number {
  let anchor = baselineAnchor;
  for (let i = 0; i < targetIndex; i++) {
    const block = blockForOccurrence(blocks, i);
    const occ = occurrences[i];
    if (!occ) continue;
    const valid = occ.loggedSets.filter((s) => s.weight != null && s.reps != null) as { weight: number; reps: number }[];
    if (valid.length === 0) continue;

    if (block.type === "retest") {
      const s = valid[0];
      anchor = epley(s.weight, s.reps);
    } else if (block.type === "deload") {
      // no anchor update — recovery week, not a data point
    } else {
      const best = Math.max(...valid.map((s) => epley(s.weight, s.reps)));
      anchor = best;
    }
  }
  return anchor;
}
