// app/coach/clients/page.tsx
import Link from "next/link";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { InviteButton } from "@/components/coach/InviteButton";

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

      <div className="flex flex-col divide-y rounded-lg border">
        {clients.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3 hover:bg-neutral-50">
            <Link
              href={`/coach/clients/${c.id}/builder`}
              className="flex flex-1 items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium">
                {initials(c.name)}
              </div>
              <span className="flex-1 text-sm">{c.name}</span>
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              {c.authUserId ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700 font-medium">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 font-medium">
                  No login
                </span>
              )}

              {c.authUserId ? (
                <Link
                  href={`/coach/clients/${c.id}/edit`}
                  className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-100 transition-colors"
                >
                  Edit
                </Link>
              ) : (
                <InviteButton clientId={c.id} clientName={c.name} />
              )}
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">No clients yet.</p>
        )}
      </div>
    </main>
  );
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
