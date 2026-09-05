// app/invite/[token]/page.tsx
// Client lands here from the invite link. If already signed in with
// Google and their authUserId isn't linked yet, we link them automatically.
// If not signed in, we show a "Sign in with Google" button.

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/role";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Look up the invite
  const invite = await db.clientInvite.findUnique({
    where: { token },
    include: { client: true },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-medium">This invite link is invalid or has expired.</p>
        <p className="mt-2 text-sm text-neutral-500">Ask your coach to send a new one.</p>
      </main>
    );
  }

  // Check if user is already signed in
  const { data } = await auth.getSession();
  const user = data?.user;

  if (user) {
    // Already signed in — link them if not linked yet
    const existing = await db.client.findFirst({
      where: { authUserId: user.id },
    });

    if (existing && existing.id !== invite.clientId) {
      // This auth account is already linked to a different client
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-medium">This account is already linked to a different client profile.</p>
          <p className="mt-2 text-sm text-neutral-500">Sign in with a different Google account.</p>
        </main>
      );
    }

    if (!existing) {
      // Link this auth user to the client row
      await db.client.update({
        where: { id: invite.clientId },
        data: { authUserId: user.id },
      });
      await db.clientInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      });
    }

    // Already linked or just linked — send them to their workout
    redirect("/client/today");
  }

  // Not signed in — show sign in prompt
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center gap-6">
      <div>
        <p className="text-sm text-neutral-500 mb-1">You've been invited to</p>
        <p className="text-2xl font-bold">Mental Reps</p>
      </div>
      <div className="rounded-lg border p-5 max-w-sm w-full flex flex-col gap-3">
        <p className="text-sm font-medium">Welcome, {invite.client.name}</p>
        <p className="text-xs text-neutral-500">
          Sign in with Google to access your training program from your coach.
        </p>
        <AcceptInviteButton token={token} />
      </div>
    </main>
  );
}
