import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";
import { auth } from "@/lib/auth/server";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";

// GET /api/coach/bundles — list all bundles visible to this coach
export async function GET() {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await auth.getSession();
  const isAdmin = data?.user?.email === ADMIN_EMAIL;

  const bundles = await db.bundle.findMany({
    where: isAdmin ? {} : { coachId: coach.id },
    include: {
      coach: { select: { name: true } },
      items: {
        include: {
          template: { select: { id: true, name: true, price: true, currency: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ bundles, isAdmin });
}

// POST /api/coach/bundles — create a new bundle with items
export async function POST(req: Request) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, templateIds, currency, discountFlat, discountPercent, discountEndsAt, description } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  if (!templateIds || templateIds.length < 2) {
    return NextResponse.json({ error: "At least 2 templates required" }, { status: 400 });
  }

  const bundle = await db.bundle.create({
    data: {
      coachId: coach.id,
      name: name.trim(),
      description: description || null,
      currency: currency || "KWD",
      discountFlat: discountFlat != null ? Number(discountFlat) : null,
      discountPercent: discountPercent != null ? Number(discountPercent) : null,
      discountEndsAt: discountEndsAt ? new Date(discountEndsAt) : null,
      items: {
        create: templateIds.map((tid: string) => ({ templateId: tid })),
      },
    },
    include: {
      items: {
        include: {
          template: { select: { id: true, name: true, price: true, currency: true } },
        },
      },
    },
  });

  return NextResponse.json({ bundle }, { status: 201 });
}
