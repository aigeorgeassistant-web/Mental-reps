import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/coach/clients/[clientId]/exercise-history/[exerciseId]
// Returns logged sets for a specific exercise grouped by session, most recent first.
// Used by the right panel "Recent logs" section.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string; exerciseId: string }> }
) {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId, exerciseId } = await params;

  // Confirm the client belongs to this coach
  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch logged sets for this exercise + client, grouped by session
  const loggedSets = await db.loggedSet.findMany({
    where: { clientId, exerciseId },
    include: {
      session: { select: { id: true, date: true, dayLabel: true } },
    },
    orderBy: [{ session: { date: "desc" } }, { setIndex: "asc" }],
    take: 50, // cap at 50 sets across all sessions
  });

  // Group by session
  const sessionMap = new Map<string, {
    sessionId: string;
    date: string;
    sets: { setIndex: number; weight: number | null; reps: number | null }[];
  }>();

  for (const ls of loggedSets) {
    const sid = ls.sessionId;
    if (!sessionMap.has(sid)) {
      const rawDate = ls.session?.date;
      const label = rawDate
        ? new Date(rawDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
        : (ls.session?.dayLabel ?? "Unknown");
      sessionMap.set(sid, { sessionId: sid, date: label, sets: [] });
    }
    sessionMap.get(sid)!.sets.push({
      setIndex: ls.setIndex,
      weight: ls.weight !== null ? Number(ls.weight) : null,
      reps: ls.reps,
    });
  }

  // Return max 8 sessions
  const result = [...sessionMap.values()].slice(0, 8);
  return NextResponse.json(result);
}
