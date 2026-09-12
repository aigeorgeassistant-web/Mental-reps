// app/api/admin/coaches/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";
async function checkAdmin() { const { data } = await auth.getSession(); return data?.user?.email === ADMIN_EMAIL; }

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const coach = await db.coach.findUnique({ where: { id } });
  if (!coach) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.coach.delete({ where: { id } });
  if (coach.authUserId) {
    await (auth as any).admin.removeUser({ userId: coach.authUserId }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
