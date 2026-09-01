"use client";

import { authClient } from "@/lib/auth/client";

// TODO: this is a bare-minimum placeholder. Neon's auth-ui package
// (@neondatabase/auth-ui) ships prebuilt, styled sign-in/sign-up forms —
// use those instead of hand-rolling this. See SPEC.md §3 and
// https://neon.com/docs/auth/reference/ui-components
export default function SignInPage() {
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
