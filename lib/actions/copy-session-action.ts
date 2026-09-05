"use server";

import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

// Updated: also allows copying FROM template sessions (clientId: null, isTemplate: true)
// so dragging a template day to a client calendar works.
export async function copySessionToClient(
  sourceSessionId: string,
  targetClientId: string,
  targetDateKey: string // "YYYY-MM-DD"
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) {
      return { success: false, error: "Unauthorized" };
    }

    // Allow source from: client programs OR template programs owned by this coach
    const source = await db.session.findFirst({
      where: {
        id: sourceSessionId,
        program: {
          OR: [
            { client: { coachId: coach.id } },
            { clientId: null, coachId: coach.id, isTemplate: true },
          ],
        },
      },
      include: {
        sessionExercises: { orderBy: { order: "asc" } },
      },
    });
    if (!source) return { success: false, error: "Session not found" };

    const targetClient = await db.client.findFirst({
      where: { id: targetClientId, coachId: coach.id },
    });
    if (!targetClient) return { success: false, error: "Target client not found" };

    // Find or create program for target client
    let program = await db.program.findFirst({
      where: { clientId: targetClientId, isTemplate: false },
    });
    if (!program) {
      program = await db.program.create({
        data: {
          clientId: targetClientId,
          coachId: coach.id,
          name: "Program",
          isTemplate: false,
        },
      });
    }

    const [y, m, d] = targetDateKey.split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 12, 0, 0);

    const newSession = await db.session.create({
      data: {
        programId: program.id,
        date: targetDate,
        dayLabel: source.dayLabel,
        order: source.order,
        weekNumber: source.weekNumber,
      },
    });

    for (const se of source.sessionExercises) {
      await db.sessionExercise.create({
        data: {
          sessionId: newSession.id,
          exerciseId: se.exerciseId,
          order: se.order,
          sets: se.sets,
          reps: se.reps,
          setType: se.setType,
          loadType: se.loadType,
          loadValue: se.loadValue,
          loadUnit: se.loadUnit,
          coachNote: se.coachNote,
          target: se.target,
          groupId: se.groupId,
          groupColor: se.groupColor,
          isRandomizerSlot: se.isRandomizerSlot,
          slotPoolExerciseIds: se.slotPoolExerciseIds,
          rpeEnabled: se.rpeEnabled,
          restSeconds: se.restSeconds,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown error" };
  }
}
