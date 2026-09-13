// app/api/admin/clients/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";
async function checkAdmin() { const { data } = await auth.getSession(); return data?.user?.email === ADMIN_EMAIL; }

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { coachId } = await req.json();
  const client = await db.client.update({ where: { id }, data: { coachId } });
  return NextResponse.json({ client });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cascade delete in correct order
  await db.loggedSet.deleteMany({ where: { clientId: id } });
  await db.checkIn.deleteMany({ where: { clientId: id } });

  // Delete programs and their sessions/exercises
  const programs = await db.program.findMany({ where: { clientId: id }, select: { id: true } });
  for (const prog of programs) {
    const sessions = await db.session.findMany({ where: { programId: prog.id }, select: { id: true } });
    for (const sess of sessions) {
      await db.sessionExercise.deleteMany({ where: { sessionId: sess.id } });
    }
    await db.session.deleteMany({ where: { programId: prog.id } });
  }
  await db.program.deleteMany({ where: { clientId: id } });

  await db.client.delete({ where: { id } });

  if (client.authUserId) {
    await (auth as any).admin.removeUser({ userId: client.authUserId }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
