import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";
import { auth } from "@/lib/auth/server";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";

// PATCH /api/coach/templates/[id]/price
// Updates price, discount, expiry for one template.
// Admin can patch any template; coaches only their own.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await auth.getSession();
  const isAdmin = data?.user?.email === ADMIN_EMAIL;
  const { id } = await params;

  const template = await db.program.findFirst({
    where: { id, isTemplate: true, ...(isAdmin ? {} : { coachId: coach.id }) },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { price, currency, discountFlat, discountPercent, discountEndsAt, description, category } = body;

  // Only one discount type at a time — whichever is set, clear the other
  const data2: Record<string, unknown> = {};
  if (price !== undefined) data2.price = price === "" || price === null ? null : Number(price);
  if (currency !== undefined) data2.currency = currency;
  if (description !== undefined) data2.description = description || null;
  if (category !== undefined) data2.category = category || null;
  if (discountFlat !== undefined && discountFlat !== null && discountFlat !== "") {
    data2.discountFlat = Number(discountFlat);
    data2.discountPercent = null;
  } else if (discountPercent !== undefined && discountPercent !== null && discountPercent !== "") {
    data2.discountPercent = Number(discountPercent);
    data2.discountFlat = null;
  } else if ("discountFlat" in body || "discountPercent" in body) {
    data2.discountFlat = null;
    data2.discountPercent = null;
  }
  if ("discountEndsAt" in body) {
    data2.discountEndsAt = discountEndsAt ? new Date(discountEndsAt) : null;
  }

  const updated = await db.program.update({ where: { id }, data: data2 });
  return NextResponse.json({ template: updated });
}
