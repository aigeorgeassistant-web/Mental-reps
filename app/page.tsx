import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/role";

// Single URL, role-based views (SPEC.md §3) — this is the fork point.
export default async function Home() {
  const { role } = await getCurrentRole();

  if (role === "coach") redirect("/coach/clients");
  if (role === "client") redirect("/client/today");
  if (role === "guest") redirect("/sign-in");

  // role === "unlinked": signed in but not yet linked to a
  // Coach or Client row (e.g. right after accepting an invite).
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p className="text-sm text-neutral-500">
        Setting up your account — if this doesn&apos;t resolve, contact your coach.
      </p>
    </main>
  );
}
