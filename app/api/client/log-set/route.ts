// app/api/client/log-set/route.ts
// Upserts one logged set. Uses sessionExerciseId + setIndex as the unique
// key — re-logging the same set overwrites the previous entry.
// PR detection: uses estimated 1RM (Epley) so higher reps at same weight
// can beat a heavier lower-rep set. For lowerIsBetter exercises, lowest
// weight is the PR (no reps formula).

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export async function POST(req: Request) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionExerciseId, sessionId, exerciseId, setIndex, weight, reps, notes } = body;

    if (!exerciseId || setIndex === undefined) {
      return NextResponse.json({ error: "exerciseId and setIndex required" }, { status: 400 });
    }

    // Get exercise to check lowerIsBetter
    const exercise = await db.exercise.findUnique({
      where: { id: exerciseId },
      select: { lowerIsBetter: true },
    });
    const lowerIsBetter = exercise?.lowerIsBetter ?? false;

    // Fetch all prior sets for this client+exercise (excluding current upsert key)
    const priorSets = await db.loggedSet.findMany({
      where: {
        clientId: client.id,
        exerciseId,
        // exclude the row we're about to overwrite so we compare against true history
        NOT: sessionExerciseId
          ? { sessionExerciseId_setIndex: { sessionExerciseId, setIndex } }
          : undefined,
      },
      select: { weight: true, reps: true },
    });

    let isPr = false;
    if (weight != null) {
      if (lowerIsBetter) {
        // Lower weight = better (e.g. assisted pull-ups, rowing for time)
        if (priorSets.length === 0) {
          isPr = true;
        } else {
          const bestPrior = Math.min(...priorSets.map((s) => s.weight ?? Infinity));
          isPr = weight < bestPrior;
        }
      } else {
        // Higher e1RM = better
        const newE1rm = reps ? epley(weight, reps) : weight;
        if (priorSets.length === 0) {
          isPr = true;
        } else {
          const bestPriorE1rm = Math.max(
            ...priorSets.map((s) =>
              s.weight && s.reps ? epley(s.weight, s.reps) : (s.weight ?? 0)
            )
          );
          isPr = newE1rm > bestPriorE1rm;
        }
      }
    }

    // Upsert
    const logged = sessionExerciseId
      ? await db.loggedSet.upsert({
          where: { sessionExerciseId_setIndex: { sessionExerciseId, setIndex } },
          create: {
            clientId: client.id,
            exerciseId,
            sessionId: sessionId ?? null,
            sessionExerciseId,
            setIndex,
            weight: weight ?? null,
            reps: reps ?? null,
            notes: notes ?? null,
            isPr,
          },
          update: {
            weight: weight ?? null,
            reps: reps ?? null,
            notes: notes ?? null,
            isPr,
            date: new Date(),
          },
        })
      : await db.loggedSet.create({
          data: {
            clientId: client.id,
            exerciseId,
            sessionId: sessionId ?? null,
            setIndex,
            weight: weight ?? null,
            reps: reps ?? null,
            notes: notes ?? null,
            isPr,
          },
        });

    return NextResponse.json({ logged, isPr });
  } catch (err) {
    console.error("log-set error", err);
    return NextResponse.json({ error: "Failed to log set" }, { status: 500 });
  }
}
