// app/api/client/checkin/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function POST(req: Request) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { sessionId, sleep, mood, hydration, stress } = body;

  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  // Verify session belongs to this client
  const session = await db.session.findFirst({
    where: { id: sessionId, program: { clientId: client.id } },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checkin = await db.checkIn.upsert({
    where: { sessionId },
    create: {
      sessionId,
      clientId: client.id,
      date: session.date ?? new Date(),
      sleep: sleep ?? null,
      mood: mood ?? null,
      hydration: hydration ?? null,
      stress: stress ?? null,
    },
    update: {
      sleep: sleep ?? null,
      mood: mood ?? null,
      hydration: hydration ?? null,
      stress: stress ?? null,
    },
  });

  return NextResponse.json({ ok: true, checkin });
}
