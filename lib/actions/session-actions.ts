"use server";
// Called when the coach clicks an empty day in the Month calendar.
// Creates the client's live Program if one doesn't exist yet (first time
// a coach ever builds for this client), then creates a Session on that
// date. Returns the new session id so the caller can select it.
//
// NOTE: weekNumber is left null here — how week numbers get assigned for
// a live program (calendar week? weeks-since-program-start?) hasn't been
// decided yet. Week tab will just group these under "Week —" until that's
// settled. Flagging rather than guessing.

import { db } from "../db";

export async function createSessionOnDate(clientId: string, dateISO: string) {
  let program = await db.program.findFirst({
    where: { clientId, isTemplate: false },
  });

  if (!program) {
    const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    program = await db.program.create({
      data: {
        coachId: client.coachId,
        clientId,
        name: "Program",
        isTemplate: false,
      },
    });
  }

  const session = await db.session.create({
    data: {
      programId: program.id,
      date: new Date(dateISO),
      dayLabel: "New Session",
      order: 0,
    },
  });

  return session.id;
}
