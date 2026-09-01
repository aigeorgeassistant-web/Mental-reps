import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { ProgramBuilder } from "@/components/coach/ProgramBuilder";

// TODO: this is the real data-loading shell for the three-column builder
// speced in SPEC.md §6. The actual interactive UI (drag/drop, superset
// painting, timer assignment, cross-client browse) is the biggest single
// piece of remaining work — port it from the tested prototypes:
//   - "program_builder_prototype_v2" (reorder + superset painting)
//   - "full_builder_flow_prototype_v2" (month grid + cross-client drag)
//   - "timer_grouping_prototype" (straight/timed assignment)
// <ProgramBuilder> below is currently a static placeholder component;
// replace its internals with those interactions wired to real Prisma
// mutations (see components/coach/ProgramBuilder.tsx for the TODO list).
export default async function BuilderPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { role, coach } = await getCurrentRole();
  if (role !== "coach" || !coach) redirect("/");

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
    include: {
      programs: {
        where: { isTemplate: false },
        include: { sessions: { include: { sessionExercises: { include: { exercise: true } } } } },
      },
    },
  });
  if (!client) notFound();

  const exercises = await db.exercise.findMany({ orderBy: { name: "asc" } });

  return <ProgramBuilder client={client} exercises={exercises} />;
}
