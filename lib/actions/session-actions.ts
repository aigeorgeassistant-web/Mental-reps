"use server";
// Called when the coach clicks an empty day in the Month calendar.
// Creates the client's live Program if one doesn't exist yet (first time
// a coach ever builds for this client), then creates a Session on that
// date. Returns the new session id so the caller can select it.
//
// NOTE: weekNumber is left null here — how week numbers get assigned for
// a live program (calendar week? weeks-since-program-start?) hasn't been
// decided yet. Week tab will just group these under "Week —" until that's
// settled. Flagging rather than guessing.

import { db } from "../db";
import { getCurrentRole } from "@/lib/role";

export async function createSessionOnDate(clientId: string, dateISO: string) {
  let program = await db.program.findFirst({
    where: { clientId, isTemplate: false },
  });

  if (!program) {
    const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    program = await db.program.create({
      data: {
        coachId: client.coachId,
        clientId,
        name: "Program",
        isTemplate: false,
      },
    });
  }

  const session = await db.session.create({
    data: {
      programId: program.id,
      date: new Date(dateISO),
      dayLabel: "New Session",
      order: 0,
    },
  });

  return session.id;
}

export async function moveSessionToDate(
  sessionId: string,
  targetDateKey: string // "YYYY-MM-DD"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) {
      return { success: false, error: "Unauthorized" };
    }

    const session = await db.session.findFirst({
      where: {
        id: sessionId,
        program: { client: { coachId: coach.id } },
      },
    });
    if (!session) return { success: false, error: "Session not found" };

    const [y, m, d] = targetDateKey.split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 12, 0, 0);

    await db.session.update({
      where: { id: sessionId },
      data: { date: targetDate },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown error" };
  }
}

export async function deleteSessionsByIds(
  sessionIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) {
      return { success: false, error: "Unauthorized" };
    }

    // Null out LoggedSet FKs first to avoid FK constraint errors
    await db.loggedSet.updateMany({
      where: { sessionId: { in: sessionIds } },
      data: { sessionId: null, sessionExerciseId: null },
    });

    // Delete session exercises
    await db.sessionExercise.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });

    // Delete sessions (verify they belong to this coach)
    await db.session.deleteMany({
      where: {
        id: { in: sessionIds },
        program: { client: { coachId: coach.id } },
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown error" };
  }
}
