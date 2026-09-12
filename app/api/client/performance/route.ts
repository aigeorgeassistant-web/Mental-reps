// app/api/client/performance/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [loggedSets, checkIns] = await Promise.all([
    db.loggedSet.findMany({
      where: { clientId: client.id },
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
    }),
    db.checkIn.findMany({
      where: { clientId: client.id },
      include: { session: { select: { date: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ loggedSets, checkIns });
}
