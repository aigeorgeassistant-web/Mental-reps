// Shared helpers for moving/copying sessions onto a day that may already
// be occupied. Plain (non-"use server") module so types + helpers can be
// imported by both server actions and client components.

import type { Prisma } from "@prisma/client";

export type Relocation = { sessionId: string; dateKey: string };
export type DayConflict = { id: string; dayLabel: string };
export type DayActionResult = {
  success: boolean;
  error?: string;
  code?: "DAY_OCCUPIED" | "RELOCATE_INVALID";
  occupied?: DayConflict[];
};

type Tx = Prisma.TransactionClient;

export function isDateKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Sessions are stored at 12:00 (server-local) on their day.
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function dayRange(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { gte: new Date(y, m - 1, d, 0, 0, 0), lt: new Date(y, m - 1, d + 1, 0, 0, 0) };
}

// Moves one session to a new date and keeps everything attached to it in
// step: LoggedSet.date (shifted by the same delta, so time-of-day survives)
// and CheckIn.date. LoggedSet.date drives PR chronology, so it must follow.
export async function setSessionDate(tx: Tx, sessionId: string, newDate: Date) {
  const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId }, select: { date: true } });
  const delta = s.date ? newDate.getTime() - s.date.getTime() : null;
  await tx.session.update({ where: { id: sessionId }, data: { date: newDate } });
  const sets = await tx.loggedSet.findMany({ where: { sessionId }, select: { id: true, date: true } });
  for (const ls of sets) {
    await tx.loggedSet.update({
      where: { id: ls.id },
      data: { date: delta === null ? newDate : new Date(ls.date.getTime() + delta) },
    });
  }
  await tx.checkIn.updateMany({ where: { sessionId }, data: { date: newDate } });
}

type Resolved = { ok: true; moves: Relocation[] } | { ok: false; result: DayActionResult };

// If the target day already has session(s) in this program, the caller must
// supply a relocation date for EVERY one of them. Nothing is written here.
export async function resolveDayConflict(
  tx: Tx,
  args: {
    programId: string;
    targetDateKey: string;
    excludeSessionId?: string; // the session being moved (it is leaving its day)
    relocations?: Relocation[];
  }
): Promise<Resolved> {
  const { programId, targetDateKey, excludeSessionId, relocations = [] } = args;
  const fail = (error: string): Resolved => ({
    ok: false,
    result: { success: false, code: "RELOCATE_INVALID", error },
  });

  const occupied = await tx.session.findMany({
    where: {
      programId,
      date: dayRange(targetDateKey),
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
    select: { id: true, dayLabel: true },
  });
  if (occupied.length === 0) return { ok: true, moves: [] };

  const missing = occupied.some((o: DayConflict) => !relocations.some((r) => r.sessionId === o.id));
  if (missing) {
    return {
      ok: false,
      result: { success: false, code: "DAY_OCCUPIED", error: "That day already has a session.", occupied },
    };
  }

  const occupiedIds = new Set<string>(occupied.map((o: DayConflict) => o.id));
  const skipIds = [...occupiedIds, ...(excludeSessionId ? [excludeSessionId] : [])];
  const seen = new Set<string>();
  for (const r of relocations) {
    if (!occupiedIds.has(r.sessionId)) return fail("Invalid relocation.");
    if (!isDateKey(r.dateKey)) return fail("Pick a valid date for the existing session.");
    if (r.dateKey === targetDateKey) return fail("The existing session must go to a different day.");
    if (seen.has(r.dateKey)) return fail("Two sessions can't be placed on the same day.");
    seen.add(r.dateKey);
    const clash = await tx.session.findFirst({
      where: { programId, date: dayRange(r.dateKey), id: { notIn: skipIds } },
      select: { dayLabel: true },
    });
    if (clash) return fail(`${r.dateKey} already has a session (${clash.dayLabel}). Pick an empty day.`);
  }
  return { ok: true, moves: relocations };
}
