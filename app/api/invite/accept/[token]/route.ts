// app/api/invite/accept/[token]/route.ts
// Better Auth redirects here (GET) after Google OAuth on the invite flow.
// This route IS behind auth.middleware() (not excluded) so auth.getSession()
// works reliably. We link the auth user to the Client row and redirect to
// /client/today. The invite page itself is public but does NO linking —
// it only shows the UI and initiates the OAuth flow.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Session is guaranteed by auth.middleware() on this route.
  const { data } = await auth.getSession();
  const user = data?.user;

  if (!user) {
    // Guard: should not happen, but bounce back to the invite page.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? \http://localhost:3001\;
    return NextResponse.redirect(new URL(`/invite/${token}`, base));
  }

  const invite = await db.clientInvite.findUnique({
    where: { token },
    include: { client: true },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? \http://localhost:3001\;

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.redirect(new URL(\/sign-in\, base));
  }

  // Check if this Google account is already linked to a DIFFERENT client.
  const existing = await db.client.findFirst({
    where: { authUserId: user.id },
  });

  if (existing && existing.id !== invite.clientId) {
    // Already a different client — just send them to their portal.
    return NextResponse.redirect(new URL(\/client/today\, base));
  }

  if (!existing) {
    // Link the auth user to the client row and write their email.
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

  return NextResponse.redirect(new URL(\/client/today\, base));
}
