import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// PATCH /api/coach/clients/[clientId]
// Updates the editable profile fields for one of the coach's own clients.
// Used by ClientProfileModal (popup inside the 3-panel builder view).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await req.json();
  const { email, phone, healthNotes, generalNotes, equipment } = body ?? {};

  const client = await db.client.update({
    where: { id: clientId },
    data: {
      email: email === undefined ? undefined : (email || null),
      phone: phone === undefined ? undefined : (phone || null),
      healthNotes: healthNotes === undefined ? undefined : (healthNotes || null),
      generalNotes: generalNotes === undefined ? undefined : (generalNotes || null),
      equipment: Array.isArray(equipment) ? equipment : undefined,
    },
  });

  return NextResponse.json({ client });
}
