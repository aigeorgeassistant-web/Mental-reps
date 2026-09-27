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

  // Per-coach "most used first" ordering. Counts how many times each
  // exercise has been placed into a session belonging to one of this
  // coach's programs. No schema change — derived live from SessionExercise,
  // scoped via Program.coachId. Exercises never used by this coach keep
  // their alphabetical order after all used ones.
  const usage = await db.sessionExercise.groupBy({
    by: ["exerciseId"],
    where: { session: { program: { coachId: coach.id } } },
    _count: { exerciseId: true },
  });
  const usageCount = new Map(usage.map((u) => [u.exerciseId, u._count.exerciseId]));

  const sortedExercises = [...exercises].sort((a, b) => {
    const ua = usageCount.get(a.id) ?? 0;
    const ub = usageCount.get(b.id) ?? 0;
    if (ua !== ub) return ub - ua; // higher usage first
    return a.name.localeCompare(b.name); // stable alphabetical fallback
  });

  return <ProgramBuilder client={client} exercises={sortedExercises} />;
}
