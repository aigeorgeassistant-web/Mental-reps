"use server";
// lib/actions/goal-actions.ts
//
// A Goal is scoped to ONE Program (a template, or one client's live copy of
// it), ONE exercise, and the day(s) it occupies. "The chain" is every
// occurrence of that exercise in those day(s), in order — that ordering is
// what turns a flat list of sessions into "week 1 / week 2 / ... " for the
// progression calculator (built in a later pass; this file just detects
// the chain and saves the coach's block list against it).
//
// Same exercise appearing twice in ONE session (main lift + finisher, say)
// must never collapse into one chain — detectGoalChain keys each chain by
// the exercise's rank among same-exercise rows within its own session, so
// "1st Chest Press each day" and "2nd Chest Press each day" are always
// treated as two independent chains.

import { db } from "../db";
import { requireOwnedProgram, requireOwnedSessionExercises } from "./ownership";
import { getCurrentRole } from "@/lib/role";
import {
  type GoalBlockDef,
  blockForOccurrence,
  staticPrescription,
  computeAnchorForOccurrence,
} from "@/lib/goalCalc";

// Rank of `sessionExerciseId` among same-exerciseId rows within its own
// session, ordered by `order` — e.g. 0 if it's the first Chest Press that
// day, 1 if it's the second.
async function rankWithinSession(sessionExerciseId: string) {
  const row = await db.sessionExercise.findUnique({
    where: { id: sessionExerciseId },
    select: { sessionId: true, exerciseId: true, order: true },
  });
  if (!row) return null;

  const siblings = await db.sessionExercise.findMany({
    where: { sessionId: row.sessionId, exerciseId: row.exerciseId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const rank = siblings.findIndex((s) => s.id === sessionExerciseId);
  return { ...row, rank: rank === -1 ? 0 : rank };
}

// For a given starting row, finds every same-rank occurrence of the same
// exercise across the given day label(s) in the same program, in
// chronological order (weekNumber if set, else date, else session.order
// as a last-resort tiebreak). Also flags any OTHER day label in this
// program that contains this exercise at all, so the builder can prompt
// "also include Pull day?" before the coach commits to a day list.
export async function detectGoalChain(sessionExerciseId: string, dayLabels: string[]) {
  const info = await rankWithinSession(sessionExerciseId);
  if (!info) return null;

  const session = await db.session.findUnique({ where: { id: info.sessionId }, select: { programId: true, dayLabel: true } });
  if (!session) return null;
  const coach = await requireOwnedProgram(session.programId);
  if (!coach) return null;

  const candidateSessions = await db.session.findMany({
    where: { programId: session.programId, dayLabel: { in: dayLabels } },
    orderBy: [{ weekNumber: "asc" }, { date: "asc" }, { order: "asc" }],
    include: {
      sessionExercises: {
        where: { exerciseId: info.exerciseId },
        orderBy: { order: "asc" },
      },
    },
  });

  const chainIds: string[] = [];
  for (const s of candidateSessions) {
    const match = s.sessionExercises[info.rank];
    if (match) chainIds.push(match.id);
  }

  const otherDayLabels = await db.session.findMany({
    where: {
      programId: session.programId,
      dayLabel: { notIn: dayLabels },
      sessionExercises: { some: { exerciseId: info.exerciseId } },
    },
    select: { dayLabel: true },
    distinct: ["dayLabel"],
  });

  return {
    programId: session.programId,
    exerciseId: info.exerciseId,
    chainSessionExerciseIds: chainIds,
    otherDayLabelsFound: [...new Set(otherDayLabels.map((s) => s.dayLabel))],
  };
}

export async function getExerciseGoal(sessionExerciseId: string) {
  const row = await db.sessionExercise.findUnique({
    where: { id: sessionExerciseId },
    select: { goalId: true },
  });
  if (!row?.goalId) return null;

  const goal = await db.exerciseGoal.findUnique({
    where: { id: row.goalId },
    include: { sessionExercises: { select: { id: true }, orderBy: { goalOccurrence: "asc" } } },
  });
  return goal;
}

export async function saveExerciseGoal(input: {
  sessionExerciseId: string;
  dayLabels: string[];
  blocks: unknown[];
  baselineAnchor: number;
  existingGoalId?: string;
}) {
  const chain = await detectGoalChain(input.sessionExerciseId, input.dayLabels);
  if (!chain) return null;
  if (chain.chainSessionExerciseIds.length === 0) return null;

  const coach = await requireOwnedSessionExercises(chain.chainSessionExerciseIds);
  if (!coach) return null;

  const goal = input.existingGoalId
    ? await db.exerciseGoal.update({
        where: { id: input.existingGoalId },
        data: { dayLabels: input.dayLabels, blocks: input.blocks as any, baselineAnchor: input.baselineAnchor },
      })
    : await db.exerciseGoal.create({
        data: {
          programId: chain.programId,
          exerciseId: chain.exerciseId,
          dayLabels: input.dayLabels,
          type: "STRENGTH",
          blocks: input.blocks as any,
          baselineAnchor: input.baselineAnchor,
        },
      });

  // Clear any stale links from a previous save with a different day-label
  // set, then relink the current chain in order.
  await db.sessionExercise.updateMany({
    where: { goalId: goal.id },
    data: { goalId: null, goalOccurrence: null },
  });

  const blocks = input.blocks as unknown as GoalBlockDef[];
  for (let i = 0; i < chain.chainSessionExerciseIds.length; i++) {
    const block = blockForOccurrence(blocks, i);
    const prescription = staticPrescription(block, input.baselineAnchor);
    const rowId = chain.chainSessionExerciseIds[i];
    const existingRow = await db.sessionExercise.findUnique({ where: { id: rowId }, select: { loadUnit: true } });
    await db.sessionExercise.update({
      where: { id: rowId },
      data: {
        goalId: goal.id,
        goalOccurrence: i,
        sets: prescription.sets,
        reps: prescription.reps,
        loadValue: prescription.weight,
        loadUnit: existingRow?.loadUnit ?? "KG",
      },
    });
  }

  return goal;
}

export async function getGoalPrescription(sessionExerciseId: string) {
  const se = await db.sessionExercise.findUnique({
    where: { id: sessionExerciseId },
    select: { goalId: true, goalOccurrence: true, session: { select: { program: { select: { coachId: true, clientId: true } } } } },
  });
  if (!se?.goalId || se.goalOccurrence == null) return null;

  const { role, coach, client } = await getCurrentRole();
  const program = se.session.program;
  const allowed =
    (role === "coach" && coach && program.coachId === coach.id) ||
    (role === "client" && client && program.clientId === client.id);
  if (!allowed) return null;

  const goal = await db.exerciseGoal.findUnique({
    where: { id: se.goalId },
    include: {
      sessionExercises: {
        orderBy: { goalOccurrence: "asc" },
        include: { loggedSets: { select: { weight: true, reps: true } } },
      },
    },
  });
  if (!goal) return null;

  const blocks = goal.blocks as unknown as GoalBlockDef[];
  const occurrences = goal.sessionExercises.map((s) => ({ loggedSets: s.loggedSets }));
  const idx = se.goalOccurrence;
  const anchor = computeAnchorForOccurrence(occurrences, blocks, goal.baselineAnchor ?? 0, idx);
  const block = blockForOccurrence(blocks, idx);
  const prescription = staticPrescription(block, anchor);

  return {
    occurrenceIndex: idx,
    cycleLength: blocks.length,
    blockType: block.type,
    sets: prescription.sets,
    reps: prescription.reps,
    weight: prescription.weight,
    anchor,
  };
}

export async function removeExerciseGoal(goalId: string) {
  const goal = await db.exerciseGoal.findUnique({ where: { id: goalId }, select: { programId: true } });
  if (!goal) return;
  const coach = await requireOwnedProgram(goal.programId);
  if (!coach) return;

  await db.sessionExercise.updateMany({ where: { goalId }, data: { goalId: null, goalOccurrence: null } });
  await db.exerciseGoal.delete({ where: { id: goalId } });
}
