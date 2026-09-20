// app/coach/clients/[clientId]/live/[sessionId]/page.tsx

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import CoachLiveSession from "@/components/coach/CoachLiveSession";

export default async function CoachLiveSessionPage({
  params,
}: {
  params: Promise<{ clientId: string; sessionId: string }>;
}) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) redirect("/sign-in");

  const { clientId, sessionId } = await params;

  // Verify client belongs to this coach
  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
    select: { id: true, name: true, units: true },
  });
  if (!client) redirect("/coach/clients");

  // Load session with exercises + existing logged sets
  const session = await db.session.findFirst({
    where: { id: sessionId, program: { clientId } },
    include: {
      sessionExercises: {
        include: {
          exercise: true,
          loggedSets: {
            where: { clientId },
            select: { setIndex: true, weight: true, reps: true },
            orderBy: { setIndex: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!session) redirect(`/coach/clients/${clientId}/builder`);

  // All exercises for the add-exercise search
  const allExercises = await db.exercise.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      muscleGroups: true,
      equipment: true,
      gifUrl: true,
      youtubeUrl: true,
      cues: true,
      lowerIsBetter: true,
      source: true,
    },
  });

  const sessionData = {
    id: session.id,
    dayLabel: session.dayLabel ?? null,
    date: session.date?.toISOString() ?? null,
    sessionExercises: session.sessionExercises as any,
  };

  return (
    <CoachLiveSession
      session={sessionData}
      clientId={clientId}
      clientName={client.name}
      allExercises={allExercises as any}
      defaultUnit={(client.units as any) ?? "KG"}
    />
  );
}
