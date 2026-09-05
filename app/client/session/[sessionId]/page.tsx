// app/client/session/[sessionId]/page.tsx
// Shows any session by ID — same UI as today but for any date.
// force-dynamic: without this, Next.js may statically cache this page
// since our auth lib doesn't use next/headers cookies() directly, so
// Next can't auto-detect the route as dynamic. Every request must hit
// the DB fresh since session content changes per sessionId.

export const dynamic = "force-dynamic";

import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { TodayWorkout } from "@/components/client/TodayWorkout";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
console.log("SESSION PAGE REQUESTED sessionId:", sessionId);
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) redirect("/");

  const session = await db.session.findFirst({
    where: { id: sessionId, program: { clientId: client.id, isTemplate: false } },
    include: { sessionExercises: { include: { exercise: true }, orderBy: { order: "asc" } } },
  });
  if (!session) notFound();

  return <TodayWorkout key={session.id} session={session} defaultUnit={client.units ?? "KG"} />;
}
