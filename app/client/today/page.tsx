import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

// TODO: port the legacy app's session player (timer runtime, GIF/YouTube
// demo, weight/reps scroll-picker logging) — logic to reuse lives in
// lib/timerNotation.ts. This page currently just proves the data path
// (client's own program only, enforced by clientId scoping below).
export default async function TodayPage() {
  const { role, client } = await getCurrentRole();
  if (role !== "client" || !client) redirect("/");

  const today = new Date();
  const session = await db.session.findFirst({
    where: {
      program: { clientId: client.id, isTemplate: false },
      date: {
        gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
      },
    },
    include: { sessionExercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
  });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-lg font-medium">Today</h1>
      {!session && <p className="text-sm text-neutral-500">No session scheduled today.</p>}
      {session && (
        <ul className="flex flex-col gap-2">
          {session.sessionExercises.map((se) => (
            <li key={se.id} className="rounded-md border p-3 text-sm">
              {se.exercise.name} — {se.sets} x {se.reps}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
