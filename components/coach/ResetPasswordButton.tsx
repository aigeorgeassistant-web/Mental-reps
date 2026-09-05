"use client";
// components/coach/ResetPasswordButton.tsx
// Triggers a password reset email to the client via Neon Auth.

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordButton({ clientEmail }: { clientEmail: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleReset() {
    setState("loading");
    try {
      await authClient.forgetPassword({
        email: clientEmail,
        redirectTo: "/sign-in",
      });
      setState("sent");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={state === "loading" || state === "sent"}
      className="rounded-md border px-3 py-2 text-sm text-left hover:bg-neutral-50 disabled:opacity-50 transition-colors"
    >
      {state === "idle" && "Send password reset email"}
      {state === "loading" && "Sending…"}
      {state === "sent" && `✓ Reset email sent to ${clientEmail}`}
      {state === "error" && "Failed — try again"}
    </button>
  );
}
