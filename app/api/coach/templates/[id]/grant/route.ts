import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

// POST /api/coach/templates/[id]/grant
// Body: { clientId: string }
// Creates a TemplatePurchase with pricePaid=0 and grantedBy=coach.id
// Idempotent — silently succeeds if the client already has access.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await req.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  // Verify template belongs to this coach
  const template = await db.program.findFirst({
    where: { id, coachId: coach.id, isTemplate: true },
    select: { id: true, currency: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify client belongs to this coach
  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Idempotent — skip if already granted/purchased
  const existing = await db.templatePurchase.findFirst({
    where: { templateId: id, clientId },
  });
  if (existing) {
    return NextResponse.json({ ok: true, alreadyGranted: true });
  }

  await db.templatePurchase.create({
    data: {
      templateId: id,
      clientId,
      pricePaid: 0,
      currency: template.currency ?? "KWD",
      grantedBy: coach.id,
    },
  });

  return NextResponse.json({ ok: true });
}
