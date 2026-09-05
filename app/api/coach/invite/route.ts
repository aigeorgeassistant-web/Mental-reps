// app/api/coach/invite/route.ts
// Creates a ClientInvite token and returns the full invite URL.
// Token expires in 7 days. Safe to call multiple times — each call
// creates a fresh token (old ones expire naturally).

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

  // Verify this client belongs to this coach
  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await db.clientInvite.create({
    data: { clientId, expiresAt },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const inviteUrl = `${base}/invite/${invite.token}`;

  return NextResponse.json({ inviteUrl });
}
