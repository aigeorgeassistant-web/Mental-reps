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
  await db.client.delete({ where: { id } });
  if (client.authUserId) {
    await (auth as any).admin.removeUser({ userId: client.authUserId }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
