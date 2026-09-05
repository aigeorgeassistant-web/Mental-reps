// app/api/client/move-session/route.ts
// Moves a session to a new date. If the target date already has a session
// in the same program, the two sessions swap dates.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, targetDate } = await req.json();
  if (!sessionId || !targetDate) {
    return NextResponse.json({ error: "sessionId and targetDate required" }, { status: 400 });
  }

  const session = await db.session.findFirst({
    where: { id: sessionId, program: { clientId: client.id, isTemplate: false } },
  });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Parse target as UTC midnight
  const t = new Date(targetDate);
  const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Check if target date already has a session
  const existing = await db.session.findFirst({
    where: {
      programId: session.programId,
      date: { gte: dayStart, lt: dayEnd },
      id: { not: sessionId },
    },
  });

  if (existing) {
    // Swap: move existing to the source date, then move this one to target
    const sourceDate = session.date;
    await db.session.update({ where: { id: existing.id }, data: { date: sourceDate } });
  }

  await db.session.update({ where: { id: sessionId }, data: { date: dayStart } });

  return NextResponse.json({ ok: true, swapped: !!existing });
}
