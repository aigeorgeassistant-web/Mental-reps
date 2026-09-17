// app/client/today/page.tsx
export const dynamic = "force-dynamic";

import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TodayWorkout } from "@/components/client/TodayWorkout";

export default async function TodayPage() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) redirect("/");

  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const sessions = await db.session.findMany({
    where: {
      program: { clientId: client.id, isTemplate: false },
      date: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, date: true },
  });

  let best: { id: string; date: Date } | null = null;
  for (const s of sessions) {
    if (!s.date) continue;
    if (!best || Math.abs(s.date.getTime() - now.getTime()) < Math.abs(best.date.getTime() - now.getTime())) {
      best = s as { id: string; date: Date };
    }
  }

  if (best) redirect(`/client/session/${best.id}`);

  return <TodayWorkout session={null} defaultUnit={client.units ?? "KG"} />;
}
