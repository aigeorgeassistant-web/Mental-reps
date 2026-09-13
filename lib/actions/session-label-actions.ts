"use server";
// Renames a session's dayLabel — shown at the top of the center panel and
// on the Month calendar card in the left panel (same underlying field).

import { db } from "../db";
import { requireOwnedSession } from "./ownership";

export async function setSessionDayLabel(sessionId: string, dayLabel: string) {
  const coach = await requireOwnedSession(sessionId);
  if (!coach) return;

  await db.session.update({
    where: { id: sessionId },
    data: { dayLabel },
  });
}
