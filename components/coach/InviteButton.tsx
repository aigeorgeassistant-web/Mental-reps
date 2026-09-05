"use client";
// components/coach/InviteButton.tsx
// Calls the invite API, then copies the link to clipboard and shows
// a brief confirmation. No page reload needed.

import { useState } from "react";

export function InviteButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle");

  async function handleInvite() {
    setState("loading");
    try {
      const res = await fetch("/api/coach/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error();
      const { inviteUrl } = await res.json();
      await navigator.clipboard.writeText(inviteUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      onClick={handleInvite}
      disabled={state === "loading"}
      className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-100 disabled:opacity-50 transition-colors"
    >
      {state === "idle" && "Invite"}
      {state === "loading" && "…"}
      {state === "copied" && "✓ Link copied"}
      {state === "error" && "Failed"}
    </button>
  );
}
