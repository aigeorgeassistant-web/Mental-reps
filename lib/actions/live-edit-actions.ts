"use server";
// lib/actions/live-edit-actions.ts
// Coach edit-mode actions for the live logging screen.
//
// deleteSetForSession: permanently removes ONE set from ONE day's
// SessionExercise row — not the template, not future/past occurrences of
// this exercise. Purges the LoggedSet if one existed, shifts later set
// indices down by one so the remaining sets stay contiguous (0..n-1),
// decrements that row's prescribed `sets` count for today, and recomputes
// (or purges) the PR cache.

import { db } from "../db";
import { requireOwnedSessionExercises } from "./ownership";
import { recomputeOrPurgePr } from "../pr-recompute";

export async function deleteSetForSession(sessionExerciseId: string, setIndex: number) {
  const coach = await requireOwnedSessionExercises([sessionExerciseId]);
  if (!coach) return;

  const se = await db.sessionExercise.findUnique({
    where: { id: sessionExerciseId },
    include: { session: { include: { program: true } } },
  });
  if (!se) return;
  const clientId = se.session.program.clientId;
  if (!clientId) return;

  // Purge the logged set for this slot, if any.
  await db.loggedSet.deleteMany({ where: { sessionExerciseId, setIndex } });

  // Shift every later set down by one so indices stay contiguous.
  const later = await db.loggedSet.findMany({
    where: { sessionExerciseId, setIndex: { gt: setIndex } },
    orderBy: { setIndex: "asc" },
  });
  for (const s of later) {
    await db.loggedSet.update({ where: { id: s.id }, data: { setIndex: s.setIndex - 1 } });
  }

  // One fewer prescribed set, today only — this row belongs to this
  // session/date alone, so next week's (or a template's) row is untouched.
  const newSets = Math.max(0, (se.sets ?? 1) - 1);
  await db.sessionExercise.update({ where: { id: sessionExerciseId }, data: { sets: newSets } });

  await recomputeOrPurgePr(clientId, se.exerciseId);
}
