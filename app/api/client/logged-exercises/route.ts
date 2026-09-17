import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Distinct exercises this client has logged, ordered by name
  const rows = await db.loggedSet.findMany({
    where: { clientId: client.id, exerciseId: { not: null } },
    distinct: ["exerciseId"],
    select: { exerciseId: true, exercise: { select: { name: true } } },
    orderBy: { exercise: { name: "asc" } },
  });

  const exercises = rows
    .filter((r) => r.exerciseId && r.exercise)
    .map((r) => ({ exerciseId: r.exerciseId!, name: r.exercise!.name }));

  return NextResponse.json({ exercises });
}
