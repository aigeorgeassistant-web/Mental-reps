"use server";
// Renames a session's dayLabel — shown at the top of the center panel and
// on the Month calendar card in the left panel (same underlying field).

import { db } from "../db";

export async function setSessionDayLabel(sessionId: string, dayLabel: string) {
  await db.session.update({
    where: { id: sessionId },
    data: { dayLabel },
  });
}
