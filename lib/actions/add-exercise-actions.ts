"use server";
// Called when the coach clicks an exercise in the left panel's Exercises
// tab while a session is open. Appends it to the end of that session's
// exercise list. Also used by the live-logging view when the coach adds
// an exercise on the spot mid-session — same append-at-end behavior,
// written straight into that session's real exercise list.

import { db } from "../db";
import { requireOwnedSession } from "./ownership";

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const coach = await requireOwnedSession(sessionId);
  if (!coach) return null;

  const count = await db.sessionExercise.count({ where: { sessionId } });

  return db.sessionExercise.create({
    data: {
      sessionId,
      exerciseId,
      order: count,
    },
  });
}
