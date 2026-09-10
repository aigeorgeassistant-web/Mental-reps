// app/api/client/exercises/[exerciseId]/history/route.ts
// GET /api/client/exercises/[exerciseId]/history
// Returns all logged sets for this client + exercise, ordered by date.
// Also returns computed bestSet (weight × reps with best e1RM) and bestDate.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exerciseId: string }> }
) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) return NextResponse.json([], { status: 401 });

  const { exerciseId } = await params;

  const [exercise, sets] = await Promise.all([
    db.exercise.findUnique({ where: { id: exerciseId }, select: { lowerIsBetter: true } }),
    db.loggedSet.findMany({
      where: { clientId: client.id, exerciseId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        weight: true,
        reps: true,
        duration: true,
        distance: true,
        setIndex: true,
        sessionId: true,
        notes: true,
        isPr: true,
        session: { select: { date: true } },
      },
    }),
  ]);

  const lowerIsBetter = exercise?.lowerIsBetter ?? false;

  const mappedSets = sets.map((s) => ({
    ...s,
    displayDate: (s.session?.date ?? s.date).toISOString().slice(0, 10),
    session: undefined, // don't leak full session object
  }));

  // Find the best-ever set for the PR badge (use displayDate for output)
  let bestSet: { weight: number; reps: number; date: string } | null = null;
  if (mappedSets.length > 0) {
    if (lowerIsBetter) {
      const best = mappedSets
        .filter((s) => s.weight != null)
        .reduce((a, b) => ((a.weight ?? Infinity) <= (b.weight ?? Infinity) ? a : b));
      if (best.weight != null) {
        bestSet = { weight: best.weight, reps: best.reps ?? 0, date: best.displayDate };
      }
    } else {
      const withBoth = mappedSets.filter((s) => s.weight != null && s.reps != null);
      if (withBoth.length > 0) {
        const best = withBoth.reduce((a, b) =>
          epley(a.weight!, a.reps!) >= epley(b.weight!, b.reps!) ? a : b
        );
        if (best.weight != null) {
          bestSet = { weight: best.weight, reps: best.reps ?? 0, date: best.displayDate };
        }
      }
    }
  }

  return NextResponse.json({ sets: mappedSets, bestSet, lowerIsBetter });
}
