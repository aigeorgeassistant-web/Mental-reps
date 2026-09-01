import { auth } from "@/lib/auth/server";

// All Managed Better Auth requests (sign-in, callbacks, session checks)
// route through here. The [...path] segment name is required by Neon's
// SDK — do not rename it.
export const { GET, POST } = auth.handler();
