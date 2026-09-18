import { auth } from "./auth/server";
import { db } from "./db";

// A single account is either a Coach or a Client (never both, today).
// This is what makes "one URL, role-based views" work — see SPEC.md §3.
// Role is NOT a field on the Neon Auth user record (a hosted auth service
// doesn't give us a custom-field schema to rely on) — it's determined
// purely by which of our own tables has a row referencing this user's id.
export async function getCurrentRole() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) return { role: "guest" as const };

  const coach = await db.coach.findUnique({ where: { authUserId: user.id } });
  if (coach) return { role: "coach" as const, coach };

  const client = await db.client.findUnique({ where: { authUserId: user.id } });
  if (client) return { role: "client" as const, client };

  // Not linked by authUserId — check if email matches a coach row.
  // This handles coaches pre-created by admin: admin creates a user via
  // Better Auth (gets one authUserId), but when the coach signs in with
  // Google OAuth a *new* auth user is created with a different ID.
  // We detect this by email match and re-link the coach row to the
  // Google auth user ID, replacing the old one.
  if (user.email) {
    const coachByEmail = await db.coach.findUnique({
      where: { email: user.email },
    });
    if (coachByEmail) {
      await db.coach.update({
        where: { id: coachByEmail.id },
        data: { authUserId: user.id },
      });
      return { role: "coach" as const, coach: { ...coachByEmail, authUserId: user.id } };
    }
  }

  // Authenticated but not yet linked to a Coach/Client row — e.g. right
  // after a client accepts their invite, before the row is created.
  return { role: "unlinked" as const };
}
