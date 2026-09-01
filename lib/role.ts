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

  // Authenticated but not yet linked to a Coach/Client row — e.g. right
  // after a client accepts their invite, before the row is created.
  return { role: "unlinked" as const };
}
