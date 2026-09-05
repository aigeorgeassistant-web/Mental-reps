"use server";

import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export type TemplateSessionRow = {
  id: string;
  weekNumber: number | null;
  dayLabel: string;
  order: number;
};

// Creates a new isTemplate=true Program with no clientId
export async function createTemplateProgram(
  name: string
): Promise<{ programId: string } | { error: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) return { error: "Unauthorized" };

    const program = await db.program.create({
      data: {
        coachId: coach.id,
        clientId: null,
        name: name.trim() || "Untitled Template",
        isTemplate: true,
      },
    });

    return { programId: program.id };
  } catch (err: any) {
    return { error: err.message ?? "Failed to create template" };
  }
}

// Adds a new day session to a template week.
// Auto-numbers the day (Day 1, Day 2…) based on existing sessions in that week.
export async function addTemplateDaySession(
  programId: string,
  weekNumber: number
): Promise<{ sessionId: string } | { error: string }> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) return { error: "Unauthorized" };

    const program = await db.program.findFirst({
      where: { id: programId, coachId: coach.id, isTemplate: true },
    });
    if (!program) return { error: "Template not found" };

    const existingCount = await db.session.count({
      where: { programId, weekNumber },
    });
    const dayNumber = existingCount + 1;

    const session = await db.session.create({
      data: {
        programId,
        date: null,
        weekNumber,
        dayLabel: `Day ${dayNumber}`,
        order: dayNumber,
      },
    });

    return { sessionId: session.id };
  } catch (err: any) {
    return { error: err.message ?? "Failed to add day" };
  }
}

// Returns all sessions for a template program, ordered by week then day
export async function getTemplateSessions(
  programId: string
): Promise<TemplateSessionRow[]> {
  try {
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) return [];

    return db.session.findMany({
      where: {
        programId,
        program: { coachId: coach.id, isTemplate: true },
      },
      select: { id: true, weekNumber: true, dayLabel: true, order: true },
      orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
    });
  } catch {
    return [];
  }
}
