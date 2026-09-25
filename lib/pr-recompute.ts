// lib/pr-recompute.ts
// Shared helper: recompute (or purge) a client+exercise's ExercisePr row
// from whatever LoggedSets remain. Called after any delete that removes
// LoggedSets, so the PR cache never points at a row that no longer exists.

import { db } from "./db";

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export async function recomputeOrPurgePr(clientId: string, exerciseId: string) {
  const remaining = await db.loggedSet.findMany({
    where: { clientId, exerciseId, weight: { not: null } },
  });

  if (remaining.length === 0) {
    await db.exercisePr.delete({ where: { clientId_exerciseId: { clientId, exerciseId } } }).catch(() => {});
    return;
  }

  const exercise = await db.exercise.findUnique({ where: { id: exerciseId } });
  const lowerIsBetter = exercise?.lowerIsBetter ?? false;

  let best = remaining[0];
  for (const s of remaining) {
    const isBetter = lowerIsBetter
      ? (s.weight ?? Infinity) < (best.weight ?? Infinity)
      : epley(s.weight ?? 0, s.reps ?? 0) > epley(best.weight ?? 0, best.reps ?? 0);
    if (isBetter) best = s;
  }

  const bestE1rm = lowerIsBetter ? null : (best.weight ? epley(best.weight, best.reps ?? 0) : null);

  await db.exercisePr.upsert({
    where: { clientId_exerciseId: { clientId, exerciseId } },
    create: { clientId, exerciseId, bestWeight: best.weight, bestReps: best.reps, bestE1rm, loggedSetId: best.id },
    update: { bestWeight: best.weight, bestReps: best.reps, bestE1rm, loggedSetId: best.id },
  });
}
