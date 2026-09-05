import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/coach/clients
// Returns all clients belonging to the current coach (id + name only)
export async function GET() {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await db.client.findMany({
    where: { coachId: coach.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clients);
}
