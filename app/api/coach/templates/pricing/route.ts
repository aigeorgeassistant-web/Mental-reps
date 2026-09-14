import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";
import { auth } from "@/lib/auth/server";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";

// GET /api/coach/templates/pricing
// Returns all templates this coach can price:
// - Admin (ai.george.assistant) → all coaches' templates
// - Regular coach → only their own templates
export async function GET() {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await auth.getSession();
  const isAdmin = data?.user?.email === ADMIN_EMAIL;

  const templates = await db.program.findMany({
    where: {
      isTemplate: true,
      ...(isAdmin ? {} : { coachId: coach.id }),
    },
    include: {
      coach: { select: { name: true } },
      sessions: { select: { id: true } },
      bundleItems: { select: { bundleId: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ templates, isAdmin });
}
