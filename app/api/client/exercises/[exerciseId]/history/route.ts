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
      },
    }),
  ]);

  const lowerIsBetter = exercise?.lowerIsBetter ?? false;

  // Find the best-ever set for the PR badge
  let bestSet: { weight: number; reps: number; date: string } | null = null;
  if (sets.length > 0) {
    if (lowerIsBetter) {
      const best = sets
        .filter((s) => s.weight != null)
        .reduce((a, b) => ((a.weight ?? Infinity) <= (b.weight ?? Infinity) ? a : b));
      if (best.weight != null) {
        bestSet = { weight: best.weight, reps: best.reps ?? 0, date: best.date.toISOString().slice(0, 10) };
      }
    } else {
      const best = sets
        .filter((s) => s.weight != null && s.reps != null)
        .reduce(
          (a, b) => {
            const ea = epley(a.weight ?? 0, a.reps ?? 0);
            const eb = epley(b.weight ?? 0, b.reps ?? 0);
            return ea >= eb ? a : b;
          },
          sets.filter((s) => s.weight != null && s.reps != null)[0] ?? sets[0]
        );
      if (best?.weight != null) {
        bestSet = { weight: best.weight, reps: best.reps ?? 0, date: best.date.toISOString().slice(0, 10) };
      }
    }
  }

  return NextResponse.json({ sets, bestSet, lowerIsBetter });
}
