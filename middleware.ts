import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/sign-in",
});

export const config = {
  matcher: ["/((?!sign-in|sign-up|api/auth|api/ai|_next|.*\\..*).*)" ],
};
