"use client";
// components/shared/SignOutButton.tsx
// Reusable sign-out action. Calls Better Auth's signOut then redirects to /sign-in.

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // proceed to redirect regardless
    }
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className={className} style={style}>
      {children ?? "Sign Out"}
    </button>
  );
}
