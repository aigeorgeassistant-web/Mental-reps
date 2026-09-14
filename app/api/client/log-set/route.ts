// app/api/client/log-set/route.ts
// Upserts one logged set. Uses sessionExerciseId + setIndex as the unique
// key — re-logging the same set overwrites the previous entry.
//
// PR detection reads a cached "current best" row (ExercisePr, one per
// client+exercise) instead of scanning every prior set on every log — see
// ARCHITECTURE.md. The only time we fall back to a full history scan is
// when the specific set that WAS the cached PR gets edited down below its
// old value — that's the one case the cache alone can't answer, and it's
// rare enough that a full scan there is fine.
//
// PR detection: uses estimated 1RM (Epley) so higher reps at same weight
// can beat a heavier lower-rep set. For lowerIsBetter exercises, lowest
// weight is the PR (no reps formula).
//
// Also verifies the session/sessionExercise being logged actually belongs
// to the calling client — a client can only ever write logged sets into
// their own sessions.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Full rescan — only used when the cached PR itself just got edited down.
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
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const sessionExerciseId: string | undefined = body.sessionExerciseId;
    const sessionId: string | undefined = body.sessionId;
    const exerciseId: string | undefined = body.exerciseId;
    const setIndex: number | undefined = body.setIndex;
    const weight: number | null | undefined = body.weight;
    const reps: number | null | undefined = body.reps;
    const notes: string | null | undefined = body.notes;

    if (!exerciseId || setIndex === undefined) {
      return NextResponse.json({ error: "exerciseId and setIndex required" }, { status: 400 });
    }

    // Ownership check: this sessionExercise (and session, if given) must
    // belong to a session under a program that belongs to THIS client.
    if (sessionExerciseId != null) {
      const owned = await db.sessionExercise.findFirst({
        where: { id: sessionExerciseId, session: { program: { clientId: client.id } } },
        select: { id: true },
      });
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (sessionId != null) {
      const ownedSession = await db.session.findFirst({
        where: { id: sessionId, program: { clientId: client.id } },
        select: { id: true },
      });
      if (!ownedSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get exercise to check lowerIsBetter
    const exercise = await db.exercise.findUnique({
      where: { id: exerciseId },
      select: { lowerIsBetter: true },
    });
    const lowerIsBetter = exercise?.lowerIsBetter ?? false;

    // Was this specific set previously the cached PR? Need to know before
    // we overwrite it, in case the new value demotes it.
    let existingSet: { id: string; isPr: boolean } | null = null;
    if (sessionExerciseId != null) {
      existingSet = await db.loggedSet.findUnique({
        where: { sessionExerciseId_setIndex: { sessionExerciseId, setIndex } },
        select: { id: true, isPr: true },
      });
    }

    // One row read instead of scanning the client's whole history.
    const prRow = await db.exercisePr.findUnique({
      where: { clientId_exerciseId: { clientId: client.id, exerciseId } },
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

    // Keep the cache in sync.
    if (isPr && weight != null) {
      await db.exercisePr.upsert({
        where: { clientId_exerciseId: { clientId: client.id, exerciseId } },
        create: {
          clientId: client.id,
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
      // The set that WAS the cached PR just got edited down — the cache
      // is stale and this is the one case that needs a full rescan.
      const recomputed = await recomputeBest(client.id, exerciseId, lowerIsBetter);
      if (recomputed) {
        await db.exercisePr.upsert({
          where: { clientId_exerciseId: { clientId: client.id, exerciseId } },
          create: { clientId: client.id, exerciseId, ...recomputed },
          update: { ...recomputed },
        });
        if (recomputed.loggedSetId !== logged.id) {
          await db.loggedSet.update({ where: { id: recomputed.loggedSetId }, data: { isPr: true } });
        }
      } else {
        await db.exercisePr.delete({ where: { clientId_exerciseId: { clientId: client.id, exerciseId } } }).catch(() => {});
      }
    }

    return NextResponse.json({ logged, isPr });
  } catch (err) {
    console.error("log-set error", err);
    return NextResponse.json({ error: "Failed to log set" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { role, client } = await getCurrentRole() as any;
    if (role !== "client" || !client) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionExerciseId, setIndex } = await req.json();
    if (!sessionExerciseId || setIndex === undefined) {
      return NextResponse.json({ error: "sessionExerciseId and setIndex required" }, { status: 400 });
    }

    // Verify ownership
    const se = await db.sessionExercise.findFirst({
      where: { id: sessionExerciseId },
      include: { session: { include: { program: true } } },
    });
    if (!se || se.session.program.clientId !== client.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const exerciseId = se.exerciseId;

    // Delete the logged set
    await db.loggedSet.deleteMany({
      where: { clientId: client.id, sessionExerciseId, setIndex },
    });

    // Recompute PR for this exercise
    const remaining = await db.loggedSet.findMany({
      where: { clientId: client.id, exerciseId },
      orderBy: { date: "asc" },
    });

    if (remaining.length === 0) {
      await db.exercisePr.delete({
        where: { clientId_exerciseId: { clientId: client.id, exerciseId } },
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
        where: { clientId_exerciseId: { clientId: client.id, exerciseId } },
        create: { clientId: client.id, exerciseId, bestWeight: best.weight, bestReps: best.reps, bestE1rm: best.weight ? best.weight * (1 + (best.reps ?? 0) / 30) : null, loggedSetId: best.id },
        update: { bestWeight: best.weight, bestReps: best.reps, bestE1rm: best.weight ? best.weight * (1 + (best.reps ?? 0) / 30) : null, loggedSetId: best.id },
      });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("log-set DELETE error", err);
    return NextResponse.json({ error: "Failed to delete log" }, { status: 500 });
  }
}
