// app/api/coach/unlink-client/route.ts
// Removes authUserId from a client row — revokes their login access.
// The Neon Auth account itself is untouched.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await req.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  await db.client.update({
    where: { id: clientId },
    data: { authUserId: null },
  });

  return NextResponse.json({ ok: true });
}
