import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function GET() {
  const { data } = await auth.getSession();
  const user = data?.user;

  const coachByAuthId = user?.id ? await db.coach.findUnique({ where: { authUserId: user.id } }) : null;
  const coachByEmail = user?.email ? await db.coach.findUnique({ where: { email: user.email } }) : null;

  return NextResponse.json({
    sessionUser: user ?? null,
    coachByAuthId,
    coachByEmail,
  });
}
