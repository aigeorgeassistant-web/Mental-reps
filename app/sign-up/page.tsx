"use client";

import { authClient } from "@/lib/auth/client";

// TODO: same placeholder caveat as sign-in. Also: real CLIENT accounts are
// created via a coach's invite flow (SPEC.md §5), not open self-signup —
// this page is really only for a coach's own first-time account creation.
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <button
        onClick={() =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/",
          })
        }
        className="rounded-md border px-4 py-2 text-sm"
      >
        Continue with Google
      </button>
    </main>
  );
}
