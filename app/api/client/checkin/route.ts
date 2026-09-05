import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentRole } from "@/lib/auth-helpers";

export async function POST(req: Request) {
  const { userId } = await getCurrentRole();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sessionId, sleep, mood, hydration, stress } = body;

  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  // Verify session belongs to this client and get clientId
  const session = await prisma.session.findFirst({
    where: { id: sessionId },
    include: { program: { include: { client: true } } },
  });

  if (!session || session.program.client?.authUserId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clientId = session.program.clientId;
  if (!clientId) return NextResponse.json({ error: "No client" }, { status: 400 });

  const checkin = await prisma.checkIn.upsert({
    where: { sessionId },
    create: {
      sessionId,
      clientId,
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
