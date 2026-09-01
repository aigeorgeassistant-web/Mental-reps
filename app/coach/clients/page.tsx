import Link from "next/link";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

// See the "client_list_and_detail_prototype" widget for exact interaction
// design (search, add-client form, notes access). This page wires that
// design to real data — port the prototype's markup/behavior here.
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
        <Link
          href="/coach/clients/new"
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          + Add client
        </Link>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/coach/clients/${c.id}/builder`}
            className="flex items-center gap-3 p-3 hover:bg-neutral-50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium">
              {initials(c.name)}
            </div>
            <span className="flex-1 text-sm">{c.name}</span>
          </Link>
        ))}
        {clients.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">No clients yet.</p>
        )}
      </div>
    </main>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
