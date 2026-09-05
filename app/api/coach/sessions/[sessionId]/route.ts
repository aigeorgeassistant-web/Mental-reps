import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/coach/sessions/[sessionId]
// Returns full session data including sessionExercises + exercise + loggedSets + checkIn.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const session = await db.session.findFirst({
    where: {
      id: sessionId,
      program: { coachId: coach.id },
    },
    include: {
      sessionExercises: {
        include: {
          exercise: true,
          loggedSets: {
            select: { setIndex: true, weight: true, reps: true, notes: true },
            orderBy: { setIndex: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      checkIn: {
        select: { sleep: true, mood: true, hydration: true, stress: true },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
