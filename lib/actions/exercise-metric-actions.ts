"use server";
// lib/actions/exercise-metric-actions.ts
// Sets which unit an exercise row's middle box counts — Reps (default),
// Distance, or Calories. Available on any row, goal or not: a coach can
// mark "this logs Calories" and manually log calories every set, same as
// Reps today. A Goal, when attached, just automates what this makes
// possible manually.
//
// Every explicit change here also updates this coach's remembered
// preference for this exercise, so the NEXT time they add it to any
// session it defaults to whatever they actually use it for.

import { db } from "../db";
import { requireOwnedSessionExercises } from "./ownership";

export async function setExerciseMetric(sessionExerciseId: string, metric: "REPS" | "DISTANCE" | "CALORIES") {
  const coach = await requireOwnedSessionExercises([sessionExerciseId]);
  if (!coach) return;

  const row = await db.sessionExercise.update({
    where: { id: sessionExerciseId },
    data: { metric },
    select: { exerciseId: true },
  });

  await db.coachExercisePreference.upsert({
    where: { coachId_exerciseId: { coachId: coach.id, exerciseId: row.exerciseId } },
    create: { coachId: coach.id, exerciseId: row.exerciseId, metric },
    update: { metric },
  });
}
