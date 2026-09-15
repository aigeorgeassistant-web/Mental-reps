// app/api/client/templates/route.ts
// GET /api/client/templates
// Returns templates visible to this client:
// - unlocked: true  → client has a TemplatePurchase (granted or paid)
// - unlocked: false → template has a price set (purchaseable, coming soon)

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

export async function GET() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json([], { status: 401 });

  // All priced templates from this client's coach
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
      templatePurchases: {
        where: { clientId: client.id },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Also fetch granted templates with no price (grantedBy set, price null)
  const grantedOnly = await db.templatePurchase.findMany({
    where: {
      clientId: client.id,
      template: {
        price: null,
        coachId: client.coachId,
      },
    },
    include: {
      template: {
        include: {
          sessions: {
            select: { id: true, weekNumber: true, dayLabel: true, order: true },
            orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
          },
        },
      },
    },
  });

  const result = [
    // Priced templates — unlocked if purchased/granted
    ...templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.price?.toString() ?? null,
      currency: t.currency,
      sessions: t.sessions,
      unlocked: t.templatePurchases.length > 0,
    })),
    // Granted templates with no price (free grants on unpriced templates)
    ...grantedOnly.map((tp) => ({
      id: tp.template.id,
      name: tp.template.name,
      description: tp.template.description,
      price: null,
      currency: tp.template.currency,
      sessions: tp.template.sessions,
      unlocked: true,
    })),
  ];

  // Deduplicate by id (in case a priced template was also granted)
  const seen = new Set<string>();
  return NextResponse.json(
    result.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
  );
}
