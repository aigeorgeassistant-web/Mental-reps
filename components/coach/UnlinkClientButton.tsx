"use client";
// components/coach/UnlinkClientButton.tsx
// Removes the authUserId from a client row, revoking their login access.
// The auth account itself stays in Neon — only the link is broken.
// Coach can then send a new invite to re-link a different account.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnlinkClientButton({ clientId }: { clientId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUnlink() {
    setLoading(true);
    try {
      await fetch(`/api/coach/unlink-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      router.push("/coach/clients");
      router.refresh();
    } catch {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 text-left hover:bg-red-50 transition-colors"
      >
        Remove login access
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 p-3 flex flex-col gap-2">
      <p className="text-xs text-red-600">This will revoke their login. They'll need a new invite to log back in. Continue?</p>
      <div className="flex gap-2">
        <button
          onClick={handleUnlink}
          disabled={loading}
          className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Removing…" : "Yes, remove"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
