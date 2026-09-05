// app/api/client/sessions/route.ts
// Returns all sessions for the logged-in client's active program.
// Used by the calendar popup in TodayWorkout.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await db.session.findMany({
    where: { program: { clientId: client.id, isTemplate: false } },
    select: { id: true, date: true, dayLabel: true },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ sessions: sessions.map((s) => ({ ...s, date: s.date?.toISOString() ?? null })) });
}
