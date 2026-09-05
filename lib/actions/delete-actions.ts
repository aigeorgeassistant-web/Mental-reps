"use server";
// Deletes one or more SessionExercise rows. Used both for the single-row
// "⋮ → Delete" menu and the multi-select trash button.
//
// Safety net: if the row holding a Circuit's round count (always the
// first exercise in the group) is being deleted, and other exercises in
// that circuit survive, the round count is moved onto the new first
// exercise before deleting — otherwise the whole circuit would silently
// lose its round count.

import { db } from "../db";
import { parseIntervalTarget, buildIntervalTarget } from "../timerNotation";

export async function deleteSessionExercises(ids: string[]) {
  const idSet = new Set(ids);
  const rows = await db.sessionExercise.findMany({ where: { id: { in: ids } } });
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => !!g))];

  for (const groupId of groupIds) {
    const allInGroup = await db.sessionExercise.findMany({
      where: { groupId },
      orderBy: { order: "asc" },
    });
    if (allInGroup.length === 0) continue;
    const removedFirst = idSet.has(allInGroup[0].id);
    const surviving = allInGroup.filter((r) => !idSet.has(r.id));

    if (removedFirst && surviving.length > 0) {
      const oldFirstParsed = parseIntervalTarget(allInGroup[0].target);
      if (oldFirstParsed.kind === "interval" && oldFirstParsed.rounds !== null) {
        const newFirst = surviving[0];
        const newFirstParsed = parseIntervalTarget(newFirst.target);
        const work = newFirstParsed.kind === "interval" ? newFirstParsed.workSec : oldFirstParsed.workSec;
        const rest = newFirstParsed.kind === "interval" ? newFirstParsed.restSec : oldFirstParsed.restSec;
        await db.sessionExercise.update({
          where: { id: newFirst.id },
          data: { target: buildIntervalTarget(work, rest, oldFirstParsed.rounds) },
        });
      }
    }
  }

  await db.sessionExercise.deleteMany({ where: { id: { in: ids } } });
}
