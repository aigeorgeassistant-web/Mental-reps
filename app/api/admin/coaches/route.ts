// app/api/admin/coaches/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";
async function checkAdmin() {
  const { data } = await auth.getSession();
  return data?.user?.email === ADMIN_EMAIL;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const coaches = await db.coach.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { clients: true } } },
  });
  return NextResponse.json({ coaches });
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "name, email, password required" }, { status: 400 });

  try {
    const { data, error } = await (auth as any).admin.createUser({ name, email, password, role: "user" });
    if (error || !data?.user) return NextResponse.json({ error: error?.message ?? "Auth user creation failed" }, { status: 400 });
    const coach = await db.coach.create({ data: { authUserId: data.user.id, name, email } });
    return NextResponse.json({ coach }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: 500 });
  }
}
