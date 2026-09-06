// app/api/coach/clients/[clientId]/performance/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // All logged sets for this client with exercise + session date + checkin
  const loggedSets = await db.loggedSet.findMany({
    where: { clientId },
    include: {
      exercise: { select: { id: true, name: true, muscleGroups: true } },
      session: {
        select: {
          id: true,
          date: true,
          checkIn: { select: { sleep: true, mood: true, hydration: true, stress: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  // All check-ins for this client
  const checkIns = await db.checkIn.findMany({
    where: { clientId },
    include: { session: { select: { date: true } } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ loggedSets, checkIns, clientName: client.name });
}
