"use server";
// Saves the `target` notation string for one SessionExercise row. The
// string itself must always come from buildIntervalTarget/buildEmomTarget
// in lib/timerNotation.ts (or be null for straight sets) — this action
// just writes whatever string it's given, it doesn't build one itself.

import { db } from "../db";

export async function setSessionExerciseTarget(sessionExerciseId: string, target: string | null) {
  await db.sessionExercise.update({
    where: { id: sessionExerciseId },
    data: { target },
  });
}
