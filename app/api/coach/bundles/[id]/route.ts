import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";
import { auth } from "@/lib/auth/server";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";

async function resolveBundle(id: string, coach: { id: string }, isAdmin: boolean) {
  return db.bundle.findFirst({
    where: { id, ...(isAdmin ? {} : { coachId: coach.id }) },
    include: {
      items: {
        include: {
          template: { select: { id: true, name: true, price: true, currency: true } },
        },
      },
    },
  });
}

// PATCH /api/coach/bundles/[id] — update bundle pricing/discount/items
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await auth.getSession();
  const isAdmin = data?.user?.email === ADMIN_EMAIL;
  const { id } = await params;

  const bundle = await resolveBundle(id, coach, isAdmin);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if ("discountEndsAt" in body) updateData.discountEndsAt = body.discountEndsAt ? new Date(body.discountEndsAt) : null;

  // Enforce single discount type
  if (body.discountFlat != null && body.discountFlat !== "") {
    updateData.discountFlat = Number(body.discountFlat);
    updateData.discountPercent = null;
  } else if (body.discountPercent != null && body.discountPercent !== "") {
    updateData.discountPercent = Number(body.discountPercent);
    updateData.discountFlat = null;
  } else if ("discountFlat" in body || "discountPercent" in body) {
    updateData.discountFlat = null;
    updateData.discountPercent = null;
  }

  // Replace items if provided
  if (body.templateIds) {
    if (body.templateIds.length < 2) {
      return NextResponse.json({ error: "At least 2 templates required" }, { status: 400 });
    }
    await db.bundleItem.deleteMany({ where: { bundleId: id } });
    await db.bundleItem.createMany({
      data: body.templateIds.map((tid: string) => ({ bundleId: id, templateId: tid })),
    });
  }

  const updated = await db.bundle.update({
    where: { id },
    data: updateData,
    include: {
      items: {
        include: {
          template: { select: { id: true, name: true, price: true, currency: true } },
        },
      },
    },
  });

  return NextResponse.json({ bundle: updated });
}

// DELETE /api/coach/bundles/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await auth.getSession();
  const isAdmin = data?.user?.email === ADMIN_EMAIL;
  const { id } = await params;

  const bundle = await resolveBundle(id, coach, isAdmin);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.bundle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
