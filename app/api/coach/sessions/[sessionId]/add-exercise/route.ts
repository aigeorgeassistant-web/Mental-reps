// app/api/coach/sessions/[sessionId]/add-exercise/route.ts
// Adds one exercise to a session with optional sets/reps/weight.
// Used by the paste import flow.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { role } = await getCurrentRole() as any;
  if (role !== "coach") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const body = await req.json();
  const { exerciseId, order, sets, reps, loadValue, loadUnit } = body;

  if (!exerciseId) return NextResponse.json({ error: "exerciseId required" }, { status: 400 });

  // If no order provided, append at end
  const count = await db.sessionExercise.count({ where: { sessionId } });

  const se = await db.sessionExercise.create({
    data: {
      sessionId,
      exerciseId,
      order: order ?? count,
      sets: sets ?? null,
      reps: reps ?? null,
      loadValue: loadValue ?? null,
      loadUnit: loadUnit ?? null,
    },
  });

  return NextResponse.json(se, { status: 201 });
}
