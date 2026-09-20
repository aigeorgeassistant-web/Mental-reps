// app/api/coach/live/log-set/route.ts
// Coach-side log-set for live sessions.
// Same PR logic as the client route, but role-gated to coach.
// Takes clientId in the body and verifies the session belongs to that coach's client.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

async function recomputeBest(
  clientId: string,
  exerciseId: string,
  lowerIsBetter: boolean
): Promise<{ loggedSetId: string; bestWeight: number | null; bestReps: number | null; bestE1rm: number | null } | null> {
  type PrCandidate = { id: string; weight: number | null; reps: number | null };
  const sets: PrCandidate[] = await db.loggedSet.findMany({
    where: { clientId, exerciseId, weight: { not: null } },
    select: { id: true, weight: true, reps: true },
  });
  if (sets.length === 0) return null;
  if (lowerIsBetter) {
    const best = sets.reduce((a: PrCandidate, b: PrCandidate) => ((b.weight ?? Infinity) < (a.weight ?? Infinity) ? b : a));
    return { loggedSetId: best.id, bestWeight: best.weight, bestReps: best.reps, bestE1rm: null };
  }
  const valueOf = (s: PrCandidate) => (s.reps ? epley(s.weight!, s.reps) : (s.weight ?? 0));
  const best = sets.reduce((a: PrCandidate, b: PrCandidate) => (valueOf(b) > valueOf(a) ? b : a));
  return { loggedSetId: best.id, bestWeight: best.weight, bestReps: best.reps, bestE1rm: valueOf(best) };
}

export async function POST(req: Request) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clientId: string | undefined = body.clientId;
    const sessionExerciseId: string | undefined = body.sessionExerciseId;
    const sessionId: string | undefined = body.sessionId;
    const exerciseId: string | undefined = body.exerciseId;
    const setIndex: number | undefined = body.setIndex;
    const weight: number | null | undefined = body.weight;
    const reps: number | null | undefined = body.reps;
    const notes: string | null | undefined = body.notes;

    if (!clientId || !exerciseId || setIndex === undefined) {
      return NextResponse.json({ error: "clientId, exerciseId and setIndex required" }, { status: 400 });
    }

    // Verify client belongs to this coach
    const client = await db.client.findFirst({
      where: { id: clientId, coachId: coach.id },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Ownership check on sessionExercise
    if (sessionExerciseId != null) {
      const owned = await db.sessionExercise.findFirst({
        where: { id: sessionExerciseId, session: { program: { clientId } } },
        select: { id: true },
      });
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ownership check on session
    if (sessionId != null) {
      const ownedSession = await db.session.findFirst({
        where: { id: sessionId, program: { clientId } },
        select: { id: true },
      });
      if (!ownedSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const exercise = await db.exercise.findUnique({
      where: { id: exerciseId },
      select: { lowerIsBetter: true },
    });
    const lowerIsBetter = exercise?.lowerIsBetter ?? false;

    let existingSet: { id: string; isPr: boolean } | null = null;
    if (sessionExerciseId != null) {
      existingSet = await db.loggedSet.findUnique({
        where: { sessionExerciseId_setIndex: { sessionExerciseId, setIndex } },
        select: { id: true, isPr: true },
      });
    }

    const prRow = await db.exercisePr.findUnique({
      where: { clientId_exerciseId: { clientId, exerciseId } },
    });

    let isPr = false;
    let newE1rm: number | null = null;
    if (weight != null) {
      if (lowerIsBetter) {
        isPr = !prRow || prRow.bestWeight == null || weight < prRow.bestWeight;
      } else {
        newE1rm = reps ? epley(weight, reps) : weight;
        isPr = !prRow || prRow.bestE1rm == null || newE1rm > prRow.bestE1rm;
      }
    }

    const logged = sessionExerciseId
      ? await db.loggedSet.upsert({
          where: { sessionExerciseId_setIndex: { sessionExerciseId, setIndex } },
          create: {
            clientId,
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
            clientId,
            exerciseId,
            sessionId: sessionId ?? null,
            setIndex,
            weight: weight ?? null,
            reps: reps ?? null,
            notes: notes ?? null,
            isPr,
          },
        });

    if (isPr && weight != null) {
      await db.exercisePr.upsert({
        where: { clientId_exerciseId: { clientId, exerciseId } },
        create: {
          clientId,
          exerciseId,
          loggedSetId: logged.id,
          bestWeight: weight,
          bestReps: reps ?? null,
          bestE1rm: lowerIsBetter ? null : newE1rm,
        },
        update: {
          loggedSetId: logged.id,
          bestWeight: weight,
          bestReps: reps ?? null,
          bestE1rm: lowerIsBetter ? null : newE1rm,
        },
      });
    } else if (existingSet?.isPr && prRow?.loggedSetId === existingSet.id) {
      const recomputed = await recomputeBest(clientId, exerciseId, lowerIsBetter);
      if (recomputed) {
        await db.exercisePr.upsert({
          where: { clientId_exerciseId: { clientId, exerciseId } },
          create: { clientId, exerciseId, ...recomputed },
          update: { ...recomputed },
        });
        if (recomputed.loggedSetId !== logged.id) {
          await db.loggedSet.update({ where: { id: recomputed.loggedSetId }, data: { isPr: true } });
        }
      } else {
        await db.exercisePr.delete({ where: { clientId_exerciseId: { clientId, exerciseId } } }).catch(() => {});
      }
    }

    return NextResponse.json({ logged, isPr });
  } catch (err) {
    console.error("coach live log-set error", err);
    return NextResponse.json({ error: "Failed to log set" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { clientId, sessionExerciseId, setIndex } = await req.json();
    if (!clientId || !sessionExerciseId || setIndex === undefined) {
      return NextResponse.json({ error: "clientId, sessionExerciseId and setIndex required" }, { status: 400 });
    }

    // Verify client belongs to this coach
    const client = await db.client.findFirst({
      where: { id: clientId, coachId: coach.id },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const se = await db.sessionExercise.findFirst({
      where: { id: sessionExerciseId },
      include: { session: { include: { program: true } } },
    });
    if (!se || se.session.program.clientId !== clientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const exerciseId = se.exerciseId;

    await db.loggedSet.deleteMany({
      where: { clientId, sessionExerciseId, setIndex },
    });

    const remaining = await db.loggedSet.findMany({
      where: { clientId, exerciseId },
      orderBy: { date: "asc" },
    });

    if (remaining.length === 0) {
      await db.exercisePr.delete({
        where: { clientId_exerciseId: { clientId, exerciseId } },
      }).catch(() => {});
    } else {
      const exercise = await db.exercise.findUnique({ where: { id: exerciseId } });
      const lowerIsBetter = exercise?.lowerIsBetter ?? false;
      let best = remaining[0];
      for (const s of remaining) {
        const e1rm = (w: number, r: number) => w * (1 + r / 30);
        const isBetter = lowerIsBetter
          ? (s.weight ?? Infinity) < (best.weight ?? Infinity)
          : e1rm(s.weight ?? 0, s.reps ?? 0) > e1rm(best.weight ?? 0, best.reps ?? 0);
        if (isBetter) best = s;
      }
      await db.exercisePr.upsert({
        where: { clientId_exerciseId: { clientId, exerciseId } },
        create: { clientId, exerciseId, bestWeight: best.weight, bestReps: best.reps, bestE1rm: best.weight ? best.weight * (1 + (best.reps ?? 0) / 30) : null, loggedSetId: best.id },
        update: { bestWeight: best.weight, bestReps: best.reps, bestE1rm: best.weight ? best.weight * (1 + (best.reps ?? 0) / 30) : null, loggedSetId: best.id },
      });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("coach live log-set DELETE error", err);
    return NextResponse.json({ error: "Failed to delete log" }, { status: 500 });
  }
}
