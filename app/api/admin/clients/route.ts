// app/api/admin/clients/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";
async function checkAdmin() { const { data } = await auth.getSession(); return data?.user?.email === ADMIN_EMAIL; }

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: { coach: { select: { name: true } } },
  });
  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, email, password, coachId } = await req.json();
  if (!name || !email || !password || !coachId) return NextResponse.json({ error: "name, email, password, coachId required" }, { status: 400 });

  try {
    const { data, error } = await (auth as any).admin.createUser({ name, email, password, role: "user" });
    if (error || !data?.user) return NextResponse.json({ error: error?.message ?? "Auth user creation failed" }, { status: 400 });
    const client = await db.client.create({ data: { authUserId: data.user.id, name, email, coachId } });
    return NextResponse.json({ client }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: 500 });
  }
}
