import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findUnique({
    where: { authUserId: session.user.id },
    select: { id: true },
  });
  if (!client) return NextResponse.json({ error: "Not a client" }, { status: 403 });

  const { note } = await req.json();

  // Verify this sessionExercise belongs to a session in this client's program
  const se = await prisma.sessionExercise.findUnique({
    where: { id: params.id },
    include: { session: { include: { program: { select: { clientId: true } } } } },
  });
  if (!se || se.session.program.clientId !== client.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.sessionExercise.update({
    where: { id: params.id },
    data: { clientNote: note?.trim() || null },
  });

  return NextResponse.json({ ok: true });
}
