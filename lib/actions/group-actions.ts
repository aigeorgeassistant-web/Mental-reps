"use server";
// assignSupersetGroup: unchanged from before — sets groupId + color.
//
// New in this step — applying a timer to a whole selected group at once:
// - applyGroupCircuit: writes the round count ONLY to the first id in the
//   array (index 0). Every other id gets just work/rest, no round count.
//   Matches the legacy notation convention exactly (e.g. "40/20x3" on the
//   first exercise, "40/20" / "30/30" on the rest).
// - applyGroupInterval: writes the SAME full work/rest/rounds to every id
//   independently — each exercise is self-contained.
// - applyGroupEmom: writes the same EMOM string to every id.
//
// Every export here verifies the caller owns all given ids before writing
// — see lib/actions/ownership.ts.

import { db } from "../db";
import { randomUUID } from "crypto";
import { buildIntervalTarget, buildEmomTarget } from "../timerNotation";
import { requireOwnedSessionExercises } from "./ownership";

export async function assignSupersetGroup(sessionExerciseIds: string[], groupColor: string) {
  const coach = await requireOwnedSessionExercises(sessionExerciseIds);
  if (!coach) return;

  const groupId = randomUUID();
  await Promise.all(
    sessionExerciseIds.map((id) =>
      db.sessionExercise.update({
        where: { id },
        data: { groupId, groupColor },
      })
    )
  );
}

export async function applyGroupCircuit(
  sessionExerciseIds: string[],
  workSec: number,
  restSec: number,
  rounds: number
) {
  const coach = await requireOwnedSessionExercises(sessionExerciseIds);
  if (!coach) return;

  await Promise.all(
    sessionExerciseIds.map((id, index) =>
      db.sessionExercise.update({
        where: { id },
        data: {
          target: buildIntervalTarget(workSec, restSec, index === 0 ? rounds : undefined),
        },
      })
    )
  );
}

export async function applyGroupInterval(
  sessionExerciseIds: string[],
  workSec: number,
  restSec: number,
  rounds: number
) {
  const coach = await requireOwnedSessionExercises(sessionExerciseIds);
  if (!coach) return;

  await Promise.all(
    sessionExerciseIds.map((id) =>
      db.sessionExercise.update({
        where: { id },
        data: { target: buildIntervalTarget(workSec, restSec, rounds) },
      })
    )
  );
}

export async function applyGroupEmom(
  sessionExerciseIds: string[],
  roundSec: number,
  reps?: number
) {
  const coach = await requireOwnedSessionExercises(sessionExerciseIds);
  if (!coach) return;

  await Promise.all(
    sessionExerciseIds.map((id) =>
      db.sessionExercise.update({
        where: { id },
        data: { target: buildEmomTarget(roundSec, reps) },
      })
    )
  );
}

export async function clearGroupTargets(sessionExerciseIds: string[]) {
  const coach = await requireOwnedSessionExercises(sessionExerciseIds);
  if (!coach) return;

  await Promise.all(
    sessionExerciseIds.map((id) =>
      db.sessionExercise.update({
        where: { id },
        data: { target: null },
      })
    )
  );
}
