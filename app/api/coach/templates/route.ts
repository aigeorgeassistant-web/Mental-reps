import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/coach/templates
// Returns all templates for the current coach with their sessions ordered by week+day
export async function GET() {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await db.program.findMany({
    where: { coachId: coach.id, isTemplate: true },
    select: {
      id: true,
      name: true,
      sessions: {
        select: { id: true, weekNumber: true, dayLabel: true, order: true },
        orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}
