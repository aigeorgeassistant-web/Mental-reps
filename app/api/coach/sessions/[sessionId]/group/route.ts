// app/api/coach/sessions/[sessionId]/group/route.ts
// Groups a set of SessionExercise IDs as a superset with a given color.

import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { assignSupersetGroup } from "@/lib/actions/group-actions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { role } = await getCurrentRole() as any;
  if (role !== "coach") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params; // ensure params resolved
  const { sessionExerciseIds, color } = await req.json();

  if (!sessionExerciseIds?.length || !color) {
    return NextResponse.json({ error: "sessionExerciseIds and color required" }, { status: 400 });
  }

  await assignSupersetGroup(sessionExerciseIds, color);
  return NextResponse.json({ ok: true });
}
