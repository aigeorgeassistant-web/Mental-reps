// app/api/invite/accept/[token]/route.ts
// Better Auth redirects here (GET) after Google OAuth on the invite flow.
// This route is COVERED by proxy.ts (not excluded), so getSession() has
// a reliable session context. The invite page itself is public/excluded
// and does no linking — it only shows the UI and starts the OAuth flow.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mentalreps.work";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data } = await auth.getSession();
  const user = data?.user;

  if (!user) {
    return NextResponse.redirect(new URL(`/invite/${token}`, BASE));
  }

  const invite = await db.clientInvite.findUnique({
    where: { token },
    include: { client: true },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/sign-in", BASE));
  }

  const existing = await db.client.findFirst({
    where: { authUserId: user.id },
  });

  if (existing && existing.id !== invite.clientId) {
    return NextResponse.redirect(new URL("/client/today", BASE));
  }

  if (!existing) {
    await db.client.update({
      where: { id: invite.clientId },
      data: {
        authUserId: user.id,
        ...(user.email ? { email: user.email } : {}),
      },
    });
    await db.clientInvite.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  return NextResponse.redirect(new URL("/client/today", BASE));
}
