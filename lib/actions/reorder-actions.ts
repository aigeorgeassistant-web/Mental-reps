"use server";
// Called after a drag-handle reorder in SessionEditor. Takes the full list
// of sessionExercise ids in their new order and saves that order to the
// database.

import { db } from "../db";

export async function reorderSessionExercises(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, index) =>
      db.sessionExercise.update({
        where: { id },
        data: { order: index },
      })
    )
  );
}
