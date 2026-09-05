"use client";
// components/coach/ResetPasswordButton.tsx
// TODO: wire up actual password reset via Neon Auth

export function ResetPasswordButton({ clientEmail }: { clientEmail: string }) {
  return (
    <button
      disabled
      className="rounded-md border px-3 py-2 text-sm text-left opacity-50 cursor-not-allowed"
    >
      Send password reset email (coming soon)
    </button>
  );
}
