import { NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";

// Maps N template sessions onto specific calendar dates.
function computeTemplateDates(
  startDateKey: string,
  weekdays: number[],
  count: number
): string[] {
  const [y, m, d] = startDateKey.split("-").map(Number);
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length === 0 || count === 0) return [];

  const dates: string[] = [];
  let cur = new Date(y, m - 1, d);

  while (!sorted.includes(cur.getDay())) {
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }

  for (let i = 0; i < count; i++) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    );
    const idx = sorted.indexOf(cur.getDay());
    const nextIdx = (idx + 1) % sorted.length;
    const nextDay = sorted[nextIdx];
    let jump = nextDay - cur.getDay();
    if (jump <= 0) jump += 7;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + jump);
  }

  return dates;
}

function dateRange(dateKey: string): { gte: Date; lt: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  return { gte: new Date(y, m - 1, d, 0, 0, 0), lt: new Date(y, m - 1, d + 1, 0, 0, 0) };
}

// POST /api/client/templates/[id]/apply
// Body: { startDateKey: string, weekdays: number[] }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify client has access (purchased or granted)
  const purchase = await db.templatePurchase.findFirst({
    where: { templateId, clientId: client.id },
  });
  if (!purchase) {
    return NextResponse.json({ error: "No access to this template" }, { status: 403 });
  }

  const { startDateKey, weekdays } = await req.json();
  if (!startDateKey || !Array.isArray(weekdays) || weekdays.length === 0) {
    return NextResponse.json({ error: "startDateKey and weekdays required" }, { status: 400 });
  }

  // Load template
  const template = await db.program.findFirst({
    where: { id: templateId, isTemplate: true },
    include: {
      sessions: {
        include: { sessionExercises: { orderBy: { order: "asc" } } },
        orderBy: [{ weekNumber: "asc" }, { order: "asc" }],
      },
    },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const scheduledDates = computeTemplateDates(startDateKey, weekdays, template.sessions.length);

  // Find or create client's live program
  let program = await db.program.findFirst({
    where: { clientId: client.id, isTemplate: false },
  });
  if (!program) {
    program = await db.program.create({
      data: {
        coachId: template.coachId,
        clientId: client.id,
        name: "Program",
        isTemplate: false,
      },
    });
  }

  // Delete conflicts
  const conflicts = await db.session.findMany({
    where: {
      program: { clientId: client.id, isTemplate: false },
      OR: scheduledDates.map((key) => ({ date: dateRange(key) })),
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

  // Create sessions
  const newSessions = await Promise.all(
    template.sessions.map((src, i: number) => {
      const [yr, mo, dy] = scheduledDates[i].split("-").map(Number);
      return db.session.create({
        data: {
          programId: program!.id,
          date: new Date(yr, mo - 1, dy, 12, 0, 0),
          dayLabel: src.dayLabel,
          order: src.order,
          weekNumber: src.weekNumber,
        },
      });
    })
  );

  const newSessionIdFor = new Map(template.sessions.map((src, i: number) => [src.id, newSessions[i].id]));

  const exerciseRows = template.sessions.flatMap((src) =>
    src.sessionExercises.map((se) => ({
      sessionId: newSessionIdFor.get(src.id)!,
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
    }))
  );

  if (exerciseRows.length > 0) {
    await db.sessionExercise.createMany({ data: exerciseRows });
  }

  return NextResponse.json({ sessionsCreated: template.sessions.length, scheduledDates });
}
