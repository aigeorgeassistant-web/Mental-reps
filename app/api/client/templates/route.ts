// app/api/client/templates/route.ts
// GET /api/client/templates
// Returns templates visible to this client.
// Rule: price set = visible in store. No price = private/coach-only.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json([], { status: 401 });

  // Visible = has a price set (price set = published, per design decision)
  const templates = await db.program.findMany({
    where: {
      isTemplate: true,
      price: { not: null },
      coachId: client.coachId,
    },
    include: {
      sessions: {
        select: { id: true, weekNumber: true, dayLabel: true, order: true },
        orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.price?.toString() ?? null,
      currency: t.currency,
      sessions: t.sessions,
    }))
  );
}
