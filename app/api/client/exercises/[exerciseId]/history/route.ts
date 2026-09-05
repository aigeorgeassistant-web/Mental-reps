// app/api/client/exercises/[exerciseId]/history/route.ts
// GET /api/client/exercises/[exerciseId]/history
// Returns all logged sets for this client + exercise, ordered by date.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json([], { status: 401 });

  const { exerciseId } = await params;

  const sets = await db.loggedSet.findMany({
    where: { clientId: client.id, exerciseId },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      weight: true,
      reps: true,
      duration: true,
      distance: true,
      setIndex: true,
      sessionId: true,
    },
  });

  return NextResponse.json(sets);
}
