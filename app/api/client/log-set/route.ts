// app/api/client/log-set/route.ts
// Upserts one logged set. Uses sessionExerciseId + setIndex as the unique
// key — re-logging the same set overwrites the previous entry.
// PR detection: compares weight against all prior logs for this client+exercise.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

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

    // PR detection
    const prev = await db.loggedSet.findFirst({
      where: { clientId: client.id, exerciseId },
      orderBy: { weight: "desc" },
    });
    const isPr = weight != null && (prev?.weight == null || weight > prev.weight);

    // Upsert — overwrite if same sessionExerciseId + setIndex already exists
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
