import { auth } from "@/lib/auth/server";

// Next.js 16 deprecates middleware.ts in favor of proxy.ts (same logic,
// new filename, Node.js-only runtime) — this still works today, but
// rename it when upgrading past 16.2+ if Next starts warning about it.
export default auth.middleware({
  loginUrl: "/sign-in",
});

export const config = {
  // Protect everything except the auth pages and API routes themselves —
  // avoids the "unlinked" redirect loop that a blanket matcher would cause.
  matcher: ["/((?!sign-in|sign-up|api/auth|_next|.*\\..*).*)"],
};
