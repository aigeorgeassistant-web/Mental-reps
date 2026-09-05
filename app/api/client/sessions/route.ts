// app/api/client/sessions/route.ts
// GET /api/client/sessions          — all sessions (used by calendar popup)
// GET /api/client/sessions?month=YYYY-MM — sessions for a specific month (dashboard)

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "YYYY-MM"

  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const sessions = await db.session.findMany({
      where: {
        program: { clientId: client.id, isTemplate: false },
        date: { gte: start, lt: end },
      },
      include: {
        sessionExercises: {
          include: { exercise: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ sessions: sessions.map((s) => ({ ...s, date: s.date?.toISOString() ?? null })) });
  }

  // No month param — return all sessions (calendar popup)
  const sessions = await db.session.findMany({
    where: { program: { clientId: client.id, isTemplate: false } },
    select: { id: true, date: true, dayLabel: true },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ sessions: sessions.map((s) => ({ ...s, date: s.date?.toISOString() ?? null })) });
}
