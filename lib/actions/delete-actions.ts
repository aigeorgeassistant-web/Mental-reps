"use server";
// Deletes one or more SessionExercise rows. Used both for the single-row
// "⋮ → Delete" menu, the multi-select trash button, and the coach's
// live-logging edit mode.
//
// Full purge: also deletes any LoggedSets that belonged to these rows (not
// just unlinking them) and recomputes each affected client+exercise's PR
// cache — deleting it outright if nothing is left to hold a PR.
//
// Safety net: if the row holding a Circuit's round count (always the
// first exercise in the group) is being deleted, and other exercises in
// that circuit survive, the round count is moved onto the new first
// exercise before deleting — otherwise the whole circuit would silently
// lose its round count.

import { db } from "../db";
import { parseIntervalTarget, buildIntervalTarget } from "../timerNotation";
import { requireOwnedSessionExercises } from "./ownership";
import { recomputeOrPurgePr } from "../pr-recompute";

export async function deleteSessionExercises(ids: string[]) {
  const coach = await requireOwnedSessionExercises(ids);
  if (!coach) return;

  const idSet = new Set(ids);
  const rows = await db.sessionExercise.findMany({
    where: { id: { in: ids } },
    include: { session: { include: { program: true } } },
  });
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

  // Purge LoggedSets that belonged to these rows, then fix up each
  // affected client+exercise's PR cache before the parent rows are gone.
  await db.loggedSet.deleteMany({ where: { sessionExerciseId: { in: ids } } });

  const affectedPairs = new Map<string, { clientId: string; exerciseId: string }>();
  for (const r of rows) {
    const clientId = r.session.program.clientId;
    if (!clientId) continue;
    affectedPairs.set(`${clientId}:${r.exerciseId}`, { clientId, exerciseId: r.exerciseId });
  }
  for (const { clientId, exerciseId } of affectedPairs.values()) {
    await recomputeOrPurgePr(clientId, exerciseId);
  }

  await db.sessionExercise.deleteMany({ where: { id: { in: ids } } });
}
