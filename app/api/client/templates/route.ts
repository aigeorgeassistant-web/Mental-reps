// app/api/client/templates/route.ts
// GET /api/client/templates
// Returns published templates available to this client (purchased or free)
// plus any templates manually unlocked by the coach for this client.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json([], { status: 401 });

  // Published templates from their coach
  const templates = await db.program.findMany({
    where: {
      isTemplate: true,
      isPublished: true,
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
