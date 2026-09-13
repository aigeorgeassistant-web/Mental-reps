"use server";
// Saves sets, reps, prescribed weight+unit, and coach note for one
// SessionExercise row. Any field left null is cleared.

import { db } from "../db";
import type { Units } from "@prisma/client";
import { requireOwnedSessionExercises } from "./ownership";

export async function setSessionExerciseDetails(
  sessionExerciseId: string,
  details: {
    sets: number | null;
    reps: number | null;
    loadValue: number | null;
    loadUnit: Units | null;
    coachNote: string | null;
  }
) {
  const coach = await requireOwnedSessionExercises([sessionExerciseId]);
  if (!coach) return;

  await db.sessionExercise.update({
    where: { id: sessionExerciseId },
    data: details,
  });
}
