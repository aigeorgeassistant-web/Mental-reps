import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Bodyweight",
  "Bands",
  "Kettlebell",
  "Bench",
];

// Note: there's no invite-email step yet — Neon Auth doesn't currently
// have a built-in invite/restricted-signup mechanism (see SPEC.md §3).
// For now this just creates the Client row with authUserId left null;
// linking it to a real login happens once the client signs up and a
// matching step (not yet built) connects their authUserId by email.
export default async function NewClientPage() {
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) redirect("/");

  async function createClient(formData: FormData) {
    "use server";
    const { role, coach } = await getCurrentRole();
    if (role !== "coach" || !coach) redirect("/");

    const equipment = EQUIPMENT.filter((item) => formData.get(`equip_${item}`) === "on");

    await db.client.create({
      data: {
        coachId: coach.id,
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
        <Link href="/coach/clients" className="text-sm text-neutral-500">
          ← Back
        </Link>
      </div>
      <h1 className="mb-6 text-lg font-medium">Add client</h1>

      <form action={createClient} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-neutral-500">Name</label>
          <input
            name="name"
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Fatima Al-Sayed"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="fatima@email.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Phone</label>
          <input
            name="phone"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="+965 5555 5555"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">Units</label>
          <select name="units" className="w-full rounded-md border px-3 py-2 text-sm">
            <option value="KG">kg</option>
            <option value="LB">lb</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">
            Health / mobility notes
          </label>
          <textarea
            name="healthNotes"
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. low ankle mobility"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-500">General notes</label>
          <textarea
            name="generalNotes"
            rows={2}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. prefers evening sessions"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs text-neutral-500">Equipment access</label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`equip_${item}`} />
                {item}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-md border px-3 py-2 text-sm font-medium"
        >
          Save client
        </button>
      </form>
    </main>
  );
}
