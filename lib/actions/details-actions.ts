"use server";
// Saves sets, reps, prescribed weight+unit, and coach note for one
// SessionExercise row. Any field left null is cleared.

import { db } from "../db";
import type { Units } from "@prisma/client";

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
  await db.sessionExercise.update({
    where: { id: sessionExerciseId },
    data: details,
  });
}
