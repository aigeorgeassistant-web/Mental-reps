// app/coach/clients/page.tsx
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClientRoster } from "@/components/coach/ClientRoster";
import { CoachBottomMenu } from "@/components/coach/CoachBottomMenu";

export default async function ClientsPage() {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) redirect("/");

  const clients = await db.client.findMany({
    where: { coachId: coach.id },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Clients</h1>
        <Link href="/coach/clients/new" className="rounded-md border px-3 py-1.5 text-sm">
          + Add client
        </Link>
      </div>

      <ClientRoster clients={clients} />

      <CoachBottomMenu links={[{ href: "/coach/templates", label: "🏷 Templates" }]} />
    </main>
  );
}
