"use server";
// Called when the coach clicks an exercise in the left panel's Exercises
// tab while a session is open. Appends it to the end of that session's
// exercise list.

import { db } from "../db";

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const count = await db.sessionExercise.count({ where: { sessionId } });

  await db.sessionExercise.create({
    data: {
      sessionId,
      exerciseId,
      order: count,
    },
  });
}
