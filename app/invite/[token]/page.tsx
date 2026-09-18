// app/invite/[token]/page.tsx
// Public page — excluded from auth.middleware() in middleware.ts.
// Shows the invite UI only. Auth + client linking is handled by
// /api/invite/accept/[token] after Google OAuth completes.

import { db } from "@/lib/db";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

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
