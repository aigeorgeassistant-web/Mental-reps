import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

function dateRange(dateKey: string): { gte: Date; lt: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { gte: new Date(y, m - 1, d, 0, 0, 0), lt: new Date(y, m - 1, d + 1, 0, 0, 0) };
}

// POST /api/client/templates/[id]/apply-single
// Body: { templateSessionId: string, dateKey: string }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify client has access
  const purchase = await db.templatePurchase.findFirst({
    where: { templateId, clientId: client.id },
  });
  if (!purchase) {
    return NextResponse.json({ error: "No access to this template" }, { status: 403 });
  }

  const { templateSessionId, dateKey } = await req.json();
  if (!templateSessionId || !dateKey) {
    return NextResponse.json({ error: "templateSessionId and dateKey required" }, { status: 400 });
  }

  // Load the specific template session
  const src = await db.session.findFirst({
    where: { id: templateSessionId, program: { id: templateId, isTemplate: true } },
    include: { sessionExercises: { orderBy: { order: "asc" } } },
  });
  if (!src) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Find or create client's live program
  let program = await db.program.findFirst({
    where: { clientId: client.id, isTemplate: false },
  });
  if (!program) {
    const template = await db.program.findUnique({ where: { id: templateId } });
    program = await db.program.create({
      data: {
        coachId: template!.coachId,
        clientId: client.id,
        name: "Program",
        isTemplate: false,
      },
    });
  }

  // Delete conflict on that date
  const conflicts = await db.session.findMany({
    where: {
      program: { clientId: client.id, isTemplate: false },
      date: dateRange(dateKey),
    },
    select: { id: true },
  });
  if (conflicts.length > 0) {
    const ids = conflicts.map((s) => s.id);
    await db.loggedSet.updateMany({ where: { sessionId: { in: ids } }, data: { sessionId: null } });
    await db.loggedSet.updateMany({ where: { sessionExercise: { sessionId: { in: ids } } }, data: { sessionExerciseId: null } });
    await db.sessionExercise.deleteMany({ where: { sessionId: { in: ids } } });
    await db.session.deleteMany({ where: { id: { in: ids } } });
  }

  // Create the session
  const [yr, mo, dy] = dateKey.split("-").map(Number);
  const newSession = await db.session.create({
    data: {
      programId: program.id,
      date: new Date(yr, mo - 1, dy, 12, 0, 0),
      dayLabel: src.dayLabel,
      order: src.order,
      weekNumber: src.weekNumber,
    },
  });

  if (src.sessionExercises.length > 0) {
    await db.sessionExercise.createMany({
      data: src.sessionExercises.map((se) => ({
        sessionId: newSession.id,
        exerciseId: se.exerciseId,
        order: se.order,
        sets: se.sets,
        reps: se.reps,
        setType: se.setType,
        loadType: se.loadType,
        loadValue: se.loadValue,
        loadUnit: se.loadUnit,
        coachNote: se.coachNote,
        target: se.target,
        groupId: se.groupId,
        groupColor: se.groupColor,
        isRandomizerSlot: se.isRandomizerSlot,
        slotPoolExerciseIds: se.slotPoolExerciseIds,
        rpeEnabled: se.rpeEnabled,
        restSeconds: se.restSeconds,
      })),
    });
  }

  return NextResponse.json({ ok: true, dateKey });
}
