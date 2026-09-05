// app/coach/clients/[clientId]/edit/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { ResetPasswordButton } from "@/components/coach/ResetPasswordButton";
import { UnlinkClientButton } from "@/components/coach/UnlinkClientButton";

const EQUIPMENT = [
  "Barbell", "Dumbbell", "Machine", "Cable",
  "Bodyweight", "Bands", "Kettlebell", "Bench",
];

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) redirect("/");

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) notFound();

  async function updateClient(formData: FormData) {
    "use server";
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) redirect("/");

    const equipment = EQUIPMENT.filter((item) => formData.get(`equip_${item}`) === "on");

    await db.client.update({
      where: { id: clientId },
      data: {
        name: formData.get("name") as string,
        email: formData.get("email") as string,
        phone: (formData.get("phone") as string) || null,
        healthNotes: (formData.get("healthNotes") as string) || null,
        generalNotes: (formData.get("generalNotes") as string) || null,
        equipment,
        units: (formData.get("units") as "KG" | "LB") || "KG",
      },
    });

    redirect("/coach/clients");
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/coach/clients" className="text-sm text-neutral-500">← Back</Link>
      </div>
      <h1 className="mb-6 text-lg font-medium">Edit client</h1>

      <form action={updateClient} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Name</label>
          <input name="name" required defaultValue={client.name} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Email</label>
          <input name="email" type="email" required defaultValue={client.email} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Phone</label>
          <input name="phone" defaultValue={client.phone ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="+965 5555 5555" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Units</label>
          <select name="units" defaultValue={client.units} className="w-full rounded-md border px-3 py-2 text-sm">
            <option value="KG">kg</option>
            <option value="LB">lb</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Health / mobility notes</label>
          <textarea name="healthNotes" rows={2} defaultValue={client.healthNotes ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">General notes</label>
          <textarea name="generalNotes" rows={2} defaultValue={client.generalNotes ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="mb-2 block text-xs text-neutral-500">Equipment access</label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`equip_${item}`}
                  defaultChecked={client.equipment.includes(item)}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="mt-2 rounded-md border px-3 py-2 text-sm font-medium">
          Save changes
        </button>
      </form>

      {/* Login management — only shown if client has an auth account */}
      {client.authUserId && (
        <div className="mt-8 flex flex-col gap-3 border-t pt-6">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Login management</p>
          <div className="flex flex-col gap-2">
            <ResetPasswordButton clientEmail={client.email} />
            <UnlinkClientButton clientId={client.id} />
          </div>
        </div>
      )}
    </main>
  );
}
