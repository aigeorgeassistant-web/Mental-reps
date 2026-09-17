import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scans = await db.bodyScan.findMany({
    where: { clientId: client.id },
    orderBy: { scannedAt: "asc" },
    select: {
      id: true,
      scannedAt: true,
      weight: true,
      muscleMass: true,
      fatPercent: true,
      visceralFat: true,
      bmr: true,
      phaseAngle: true,
    },
  });

  return NextResponse.json({ scans });
}
