"use server";

import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

// Maps N template sessions onto specific calendar dates.
// weekdays: array of day-of-week numbers (0=Sun … 6=Sat), sorted ascending.
// Starts from the first matching weekday on or after startDateKey.
function computeTemplateDates(
  startDateKey: string,
  weekdays: number[],
  count: number
): string[] {
  const [y, m, d] = startDateKey.split("-").map(Number);
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length === 0 || count === 0) return [];

  const dates: string[] = [];
  let cur = new Date(y, m - 1, d);

  // Advance to first matching weekday
  while (!sorted.includes(cur.getDay())) {
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }

  for (let i = 0; i < count; i++) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    );

    // Advance to next selected weekday
    const idx = sorted.indexOf(cur.getDay());
    const nextIdx = (idx + 1) % sorted.length;
    const nextDay = sorted[nextIdx];
    let jump = nextDay - cur.getDay();
    if (jump <= 0) jump += 7;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + jump);
  }

  return dates;
}

function dateRange(dateKey: string): { gte: Date; lt: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { gte: new Date(y, m - 1, d, 0, 0, 0), lt: new Date(y, m - 1, d + 1, 0, 0, 0) };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export async function previewTemplateApplication(
  templateProgramId: string,
  clientId: string,
  startDateKey: string,
  weekdays: number[]
): Promise<{ scheduledDates: string[]; conflictCount: number } | { error: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) return { error: "Unauthorized" };

    const template = await db.program.findFirst({
      where: { id: templateProgramId, coachId: coach.id, isTemplate: true },
      select: { sessions: { select: { id: true } } },
    });
    if (!template) return { error: "Template not found" };

    const scheduledDates = computeTemplateDates(
      startDateKey,
      weekdays,
      template.sessions.length
    );

    const conflicts = await db.session.findMany({
      where: {
        program: { clientId, isTemplate: false },
        OR: scheduledDates.map((key) => ({ date: dateRange(key) })),
      },
      select: { id: true },
    });

    return { scheduledDates, conflictCount: conflicts.length };
  } catch (err: any) {
    return { error: err.message ?? "Preview failed" };
  }
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export async function applyTemplateToClient(
  templateProgramId: string,
  clientId: string,
  startDateKey: string,
  weekdays: number[]
): Promise<{ sessionsCreated: number } | { error: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) return { error: "Unauthorized" };

    // Load template with full exercise data
    const template = await db.program.findFirst({
      where: { id: templateProgramId, coachId: coach.id, isTemplate: true },
      include: {
        sessions: {
          include: { sessionExercises: { orderBy: { order: "asc" } } },
          orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
        },
      },
    });
    if (!template) return { error: "Template not found" };

    const client = await db.client.findFirst({
      where: { id: clientId, coachId: coach.id },
    });
    if (!client) return { error: "Client not found" };

    const scheduledDates = computeTemplateDates(
      startDateKey,
      weekdays,
      template.sessions.length
    );

    // Find or create client's live program
    let program = await db.program.findFirst({
      where: { clientId, isTemplate: false },
    });
    if (!program) {
      program = await db.program.create({
        data: {
          coachId: coach.id,
          clientId,
          name: "Program",
          isTemplate: false,
        },
      });
    }

    // Delete existing sessions on those dates (overwrite)
    const conflicts = await db.session.findMany({
      where: {
        program: { clientId, isTemplate: false },
        OR: scheduledDates.map((key) => ({ date: dateRange(key) })),
      },
      select: { id: true },
    });

    if (conflicts.length > 0) {
      const ids = conflicts.map((s) => s.id);
      // Null out LoggedSet references before deleting (FK safety)
      await db.loggedSet.updateMany({
        where: { sessionId: { in: ids } },
        data: { sessionId: null },
      });
      await db.loggedSet.updateMany({
        where: { sessionExercise: { sessionId: { in: ids } } },
        data: { sessionExerciseId: null },
      });
      await db.sessionExercise.deleteMany({ where: { sessionId: { in: ids } } });
      await db.session.deleteMany({ where: { id: { in: ids } } });
    }

    // Create sessions from template
    for (let i = 0; i < template.sessions.length; i++) {
      const src = template.sessions[i];
      const [yr, mo, dy] = scheduledDates[i].split("-").map(Number);

      const newSession = await db.session.create({
        data: {
          programId: program.id,
          date: new Date(yr, mo - 1, dy, 12, 0, 0),
          dayLabel: src.dayLabel,
          order: src.order,
          weekNumber: src.weekNumber,
        },
      });

      for (const se of src.sessionExercises) {
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
    }

    return { sessionsCreated: template.sessions.length };
  } catch (err: any) {
    return { error: err.message ?? "Apply failed" };
  }
}
