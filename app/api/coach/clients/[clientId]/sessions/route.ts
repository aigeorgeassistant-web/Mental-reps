import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/coach/clients/[clientId]/sessions?month=YYYY-MM
// Returns all sessions for a given client in a given month
export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // "YYYY-MM"

  if (!month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [year, mon] = month.split("-").map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  const sessions = await db.session.findMany({
    where: {
      program: { clientId, isTemplate: false },
      date: { gte: start, lt: end },
    },
    select: { id: true, dayLabel: true, date: true, order: true },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(sessions);
}
