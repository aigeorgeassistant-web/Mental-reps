"use server";
// Shared ownership checks for the Server Actions that mutate a specific
// SessionExercise / Session. Every action that touches these must call one
// of these first and bail out (no-op) if it returns null — otherwise the
// action has no way to know the id it was given actually belongs to the
// calling coach's own client or template, and Server Actions are directly
// callable with any id, not just from the intended UI.

import { db } from "../db";
import { getCurrentRole } from "@/lib/role";

// Returns the calling coach if ALL given SessionExercise ids belong to a
// session under one of their own programs (client or template) — null
// otherwise, including when the caller isn't a coach at all.
export async function requireOwnedSessionExercises(ids: string[]) {
  if (ids.length === 0) return null;
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) return null;

  const count = await db.sessionExercise.count({
    where: { id: { in: ids }, session: { program: { coachId: coach.id } } },
  });
  return count === ids.length ? coach : null;
}

// Same, for a single Session id.
export async function requireOwnedSession(sessionId: string) {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) return null;

  const owned = await db.session.findFirst({
    where: { id: sessionId, program: { coachId: coach.id } },
    select: { id: true },
  });
  return owned ? coach : null;
}

// Same, for a Program id directly (used by actions that operate on a whole
// program — e.g. goal chain detection — rather than specific rows).
export async function requireOwnedProgram(programId: string) {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) return null;

  const owned = await db.program.findFirst({
    where: { id: programId, coachId: coach.id },
    select: { id: true },
  });
  return owned ? coach : null;
}
