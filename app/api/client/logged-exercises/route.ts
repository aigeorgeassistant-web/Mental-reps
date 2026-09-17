import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get distinct exerciseIds this client has logged
  const rows = await db.loggedSet.findMany({
    where: { clientId: client.id },
    distinct: ["exerciseId"],
    select: { exerciseId: true },
  });

  const exerciseIds = rows.map((r) => r.exerciseId).filter(Boolean) as string[];

  if (exerciseIds.length === 0) return NextResponse.json({ exercises: [] });

  // Fetch names for those exercises
  const exercises = await db.exercise.findMany({
    where: { id: { in: exerciseIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    exercises: exercises.map((e) => ({ exerciseId: e.id, name: e.name })),
  });
}
