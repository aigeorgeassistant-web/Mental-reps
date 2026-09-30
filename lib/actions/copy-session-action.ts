"use server";

import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";
import type { Prisma } from "@prisma/client";
import {
  isDateKey,
  parseDateKey,
  resolveDayConflict,
  setSessionDate,
  type DayActionResult,
  type Relocation,
} from "@/lib/session-day";

// Updated: also allows copying FROM template sessions (clientId: null, isTemplate: true)
// so dragging a template day to a client calendar works.
export async function copySessionToClient(
  sourceSessionId: string,
  targetClientId: string,
  targetDateKey: string, // "YYYY-MM-DD"
  relocations?: Relocation[] // required when the target day already has a session
): Promise<DayActionResult> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) {
      return { success: false, error: "Unauthorized" };
    }
    if (!isDateKey(targetDateKey)) return { success: false, error: "Invalid date" };

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

    const programId = program.id;
    const sourceExercises = source.sessionExercises;
    const sourceDayLabel = source.dayLabel;
    const sourceOrder = source.order;
    const sourceWeek = source.weekNumber;

    return await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const res = await resolveDayConflict(tx, { programId, targetDateKey, relocations });
        if (!res.ok) return res.result;
        for (const mv of res.moves) {
          await setSessionDate(tx, mv.sessionId, parseDateKey(mv.dateKey));
        }

        const newSession = await tx.session.create({
          data: {
            programId,
            date: parseDateKey(targetDateKey),
            dayLabel: sourceDayLabel,
            order: sourceOrder,
            weekNumber: sourceWeek,
          },
        });

        if (sourceExercises.length > 0) {
          await tx.sessionExercise.createMany({
            data: sourceExercises.map((se) => ({
              sessionId: newSession.id,
              exerciseId: se.exerciseId,
              order: se.order,
              sets: se.sets,
              reps: se.reps,
              repsMax: se.repsMax,
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
            })),
          });
        }
        return { success: true } as DayActionResult;
      },
      { timeout: 20000, maxWait: 10000 }
    );
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unknown error" };
  }
}
