import { createNeonAuth } from "@neondatabase/auth/next/server";

// Managed Better Auth is a HOSTED service — this is NOT a self-configured
// betterAuth() instance. Neon runs the auth backend; this just points our
// app at it. NEON_AUTH_BASE_URL comes from the Neon Console: your project
// → Auth → Configuration tab. Google OAuth is configured there too (in
// Neon's dashboard), not via env vars in this app — see SPEC.md §3.
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
