import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { note } = await req.json();

  const se = await db.sessionExercise.findUnique({
    where: { id },
    include: { session: { include: { program: { select: { clientId: true } } } } },
  });
  if (!se || se.session.program.clientId !== client.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.sessionExercise.update({
    where: { id },
    data: { clientNote: note?.trim() || null },
  });

  return NextResponse.json({ ok: true });
}
