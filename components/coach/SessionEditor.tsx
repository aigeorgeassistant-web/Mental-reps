"use client";
// Center panel. This step:
// - EMOM cards now work like Circuit: header shows the shared round
//   length ("EMOM for 120 sec"), clickable to edit it (updates every row's
//   round length, preserving each row's own reps). Each exercise shows
//   just its own reps, clickable to edit reps only.
// - Details modal shows different fields depending on context: Circuit
//   rows have no Sets (rounds live in the header). EMOM rows have neither
//   Sets nor Reps (reps lives in the header/row-click mechanism above,
//   not here — avoids two places holding a "reps" value that could
//   disagree). Interval and ungrouped rows keep all fields.
// - Weight now has a KG/LB toggle instead of being a bare number.
// - Details modal: first field autofocuses and is pre-selected, Enter
//   moves to the next numeric field, empty numeric fields save as 0.
// - Delete: a trash button in the color-popup (bulk, for the whole
//   selection) and a "⋮" menu on every row (single). Both go through
//   deleteSessionExercises, which protects a Circuit's round count if the
//   row holding it is removed.

import { useEffect, useRef, useState } from "react";
import type { Exercise, Session, SessionExercise, Units } from "@prisma/client";
import { reorderSessionExercises } from "@/lib/actions/reorder-actions";
import {
  assignSupersetGroup,
  applyGroupCircuit,
  applyGroupInterval,
  applyGroupEmom,
  clearGroupTargets,
} from "@/lib/actions/group-actions";
import { setSessionExerciseTarget } from "@/lib/actions/target-actions";
import { setSessionExerciseDetails } from "@/lib/actions/details-actions";
import { deleteSessionExercises } from "@/lib/actions/delete-actions";
import { setSessionDayLabel } from "@/lib/actions/session-label-actions";
import {
  parseIntervalTarget,
  buildIntervalTarget,
  buildEmomTarget,
} from "@/lib/timerNotation";
import { useRouter } from "next/navigation";

type Row = SessionExercise & { exercise: Exercise };
type SessionWithExercises = Session & { sessionExercises: Row[] };

const PALETTE = ["#FCA5A5", "#FDBA74", "#FDE68A", "#86EFAC", "#93C5FD", "#C4B5FD"];

type GroupPopup = {
  x: number;
  y: number;
  ids: string[];
  disabledColors: string[];
  stage: "color" | "straightOrTimed" | "timerType";
};

type GroupTimerForm = {
  ids: string[];
  type: "circuit" | "interval" | "emom";
};

type Block =
  | { kind: "single"; row: Row; index: number }
  | { kind: "plainGroup"; rows: Row[]; indices: number[]; color: string | null }
  | { kind: "circuit"; rows: Row[]; indices: number[]; color: string | null; rounds: number; workSec: number; restSec: number }
  | { kind: "interval"; rows: Row[]; indices: number[]; color: string | null }
  | { kind: "emom"; rows: Row[]; indices: number[]; color: string | null; roundSec: number };

function buildBlocks(rows: Row[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (!row.groupId) {
      blocks.push({ kind: "single", row, index: i });
      i++;
      continue;
    }
    let j = i;
    const groupRows: Row[] = [];
    const indices: number[] = [];
    while (j < rows.length && rows[j].groupId === row.groupId) {
      groupRows.push(rows[j]);
      indices.push(j);
      j++;
    }
    const color = groupRows[0].groupColor;
    const firstParsed = parseIntervalTarget(groupRows[0].target);

    if (firstParsed.kind === "interval" && firstParsed.rounds !== null) {
      const isCircuit = groupRows.slice(1).every((r) => {
        const p = parseIntervalTarget(r.target);
        return !(p.kind === "interval" && p.rounds !== null);
      });
      if (isCircuit) {
        blocks.push({
          kind: "circuit",
          rows: groupRows,
          indices,
          color,
          rounds: firstParsed.rounds,
          workSec: firstParsed.workSec,
          restSec: firstParsed.restSec,
        });
        i = j;
        continue;
      }
    }
    if (firstParsed.kind === "interval") {
      blocks.push({ kind: "interval", rows: groupRows, indices, color });
      i = j;
      continue;
    }
    if (firstParsed.kind === "emom") {
      blocks.push({ kind: "emom", rows: groupRows, indices, color, roundSec: firstParsed.roundSec });
      i = j;
      continue;
    }
    blocks.push({ kind: "plainGroup", rows: groupRows, indices, color });
    i = j;
  }
  return blocks;
}

function detailsSummary(row: Row): string | null {
  const parts: string[] = [];
  if (row.sets && row.reps) parts.push(`${row.sets}×${row.reps}`);
  else if (row.reps) parts.push(`${row.reps} reps`);
  if (row.loadValue) parts.push(`${row.loadValue}${row.loadUnit ? row.loadUnit.toLowerCase() : ""}`);
  return parts.length ? parts.join(" · ") : null;
}

type RowEditState =
  | { rowId: string; mode: "workrest"; prefillWork: number; prefillRest: number; preserveRounds: number | undefined }
  | { rowId: string; mode: "emomReps"; prefillReps: number | ""; roundSecToKeep: number };

type HeaderEditState =
  | { kind: "circuit"; firstRowId: string; workSec: number; restSec: number; currentRounds: number }
  | { kind: "emom"; rows: { id: string; reps: number | null }[]; currentRoundSec: number };

type DetailsEditState = {
  rowId: string;
  sets: number | "";
  reps: number | "";
  loadValue: number | "";
  loadUnit: Units;
  coachNote: string;
  showSets: boolean;
  showReps: boolean;
};

export function SessionEditor({
  session,
  onSelectExerciseDetail,
  onAfterMutation,
  isTemplateSession,
}: {
  session: SessionWithExercises;
  onSelectExerciseDetail: (exerciseId: string) => void;
  onAfterMutation?: () => void;
  isTemplateSession?: boolean;
}) {
  const router = useRouter();
  const afterMutation = () => { router.refresh(); onAfterMutation?.(); };
  const [rows, setRows] = useState<Row[]>(
    [...session.sessionExercises].sort((a, b) => a.order - b.order)
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragBlockKey, setDragBlockKey] = useState<string | null>(null);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectAnchor, setSelectAnchor] = useState<number | null>(null);
  const [selectEnd, setSelectEnd] = useState<number | null>(null);
  const mouseDownOnNameRef = useRef(false);
  const [groupPopup, setGroupPopup] = useState<GroupPopup | null>(null);
  const [groupTimerForm, setGroupTimerForm] = useState<GroupTimerForm | null>(null);

  const [workSec, setWorkSec] = useState(40);
  const [restSec, setRestSec] = useState(20);
  const [rounds, setRounds] = useState(3);
  const [roundSec, setRoundSec] = useState(60);
  const [reps, setReps] = useState<number | "">("");

  const [timerRowId, setTimerRowId] = useState<string | null>(null);
  const [timerMode, setTimerMode] = useState<"straight" | "interval" | "emom">("straight");

  const [headerEdit, setHeaderEdit] = useState<HeaderEditState | null>(null);
  const [rowEdit, setRowEdit] = useState<RowEditState | null>(null);
  const [detailsEdit, setDetailsEdit] = useState<DetailsEditState | null>(null);

  useEffect(() => {
    setRows([...session.sessionExercises].sort((a, b) => a.order - b.order));
  }, [session.id, session.sessionExercises]);

  const [templateLocked, setTemplateLocked] = useState(true);
  useEffect(() => { if (isTemplateSession) setTemplateLocked(true); }, [session.id, isTemplateSession]);
  const locked = isTemplateSession === true && templateLocked;

  const blocks = buildBlocks(rows);

  function blockKeyOf(b: Block): string {
    return b.kind === "single" ? b.row.id : b.rows[0].id;
  }

  function flattenBlocks(blockList: Block[]): Row[] {
    const out: Row[] = [];
    for (const b of blockList) {
      if (b.kind === "single") out.push(b.row);
      else out.push(...b.rows);
    }
    return out;
  }

  function handleBlockDrop(targetRowIndex: number) {
    if (locked || !dragBlockKey) return;
    const targetBlock = blocks.find((b) =>
      b.kind === "single" ? b.index === targetRowIndex : b.indices.includes(targetRowIndex)
    );
    setDragBlockKey(null);
    if (!targetBlock) return;
    const targetKey = blockKeyOf(targetBlock);
    if (targetKey === dragBlockKey) return;

    const draggedIdx = blocks.findIndex((b) => blockKeyOf(b) === dragBlockKey);
    if (draggedIdx === -1) return;
    const newBlocks = [...blocks];
    const [dragged] = newBlocks.splice(draggedIdx, 1);
    const newTargetIdx = newBlocks.findIndex((b) => blockKeyOf(b) === targetKey);
    newBlocks.splice(newTargetIdx, 0, dragged);

    const newRows = flattenBlocks(newBlocks);
    setRows(newRows);
    reorderSessionExercises(newRows.map((r) => r.id));
  }

  function handleDrop(targetIndex: number) {
    if (dragBlockKey !== null) {
      handleBlockDrop(targetIndex);
    } else {
      handleReorderDrop(targetIndex);
    }
  }

  function handleReorderDrop(targetIndex: number) {
    if (locked || dragIndex === null || dragIndex === targetIndex) return;
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setRows(next);
    setDragIndex(null);
    reorderSessionExercises(next.map((r) => r.id));
  }

  function startSelect(e: React.MouseEvent, index: number) {
    mouseDownOnNameRef.current = !!(e.target as HTMLElement).closest('[data-role="exercise-name"]');
    setIsSelecting(true);
    setSelectAnchor(index);
    setSelectEnd(index);
  }

  function extendSelect(index: number) {
    if (isSelecting) setSelectEnd(index);
  }

  function finishSelect(e: React.MouseEvent) {
    if (!isSelecting || selectAnchor === null || selectEnd === null) {
      setIsSelecting(false);
      return;
    }
    const lo = Math.min(selectAnchor, selectEnd);
    const hi = Math.max(selectAnchor, selectEnd);
    setIsSelecting(false);

    if (hi > lo && !locked) {
      // real drag across multiple rows — start the superset color flow
      const ids = rows.slice(lo, hi + 1).map((r) => r.id);
      const disabledColors: string[] = [];
      const prevColor = lo > 0 ? rows[lo - 1].groupColor : null;
      const nextColor = hi < rows.length - 1 ? rows[hi + 1].groupColor : null;
      if (prevColor) disabledColors.push(prevColor);
      if (nextColor && nextColor !== prevColor) disabledColors.push(nextColor);
      setGroupPopup({ x: e.clientX, y: e.clientY, ids, disabledColors, stage: "color" });
    } else if (mouseDownOnNameRef.current) {
      // no drag happened — this was a plain click on the exercise name
      const row = rows[lo];
      if (row) onSelectExerciseDetail(row.exerciseId);
    }
    setSelectAnchor(null);
    setSelectEnd(null);
  }

  function isRowInSelection(index: number) {
    if (!isSelecting || selectAnchor === null || selectEnd === null) return false;
    const lo = Math.min(selectAnchor, selectEnd);
    const hi = Math.max(selectAnchor, selectEnd);
    return index >= lo && index <= hi;
  }

  function pickColor(color: string) {
    if (!groupPopup) return;
    assignSupersetGroup(groupPopup.ids, color).then(afterMutation);
    setGroupPopup({ ...groupPopup, stage: "straightOrTimed" });
  }

  function deleteSelection() {
    if (!groupPopup) return;
    deleteSessionExercises(groupPopup.ids).then(afterMutation);
    setGroupPopup(null);
  }

  function pickStraight() {
    if (!groupPopup) return;
    clearGroupTargets(groupPopup.ids).then(afterMutation);
    setGroupPopup(null);
  }

  function pickTimed() {
    if (!groupPopup) return;
    setGroupPopup({ ...groupPopup, stage: "timerType" });
  }

  function pickTimerType(type: "circuit" | "interval" | "emom") {
    if (!groupPopup) return;
    setWorkSec(40);
    setRestSec(20);
    setRounds(3);
    setRoundSec(60);
    setReps("");
    setGroupTimerForm({ ids: groupPopup.ids, type });
    setGroupPopup(null);
  }

  function saveGroupTimer() {
    if (!groupTimerForm) return;
    const { ids, type } = groupTimerForm;
    const action =
      type === "circuit"
        ? applyGroupCircuit(ids, workSec, restSec, rounds)
        : type === "interval"
        ? applyGroupInterval(ids, workSec, restSec, rounds)
        : applyGroupEmom(ids, roundSec, reps === "" ? undefined : reps);
    action.then(afterMutation);
    setGroupTimerForm(null);
  }

  function openTimerEditor(row: Row) {
    const parsed = parseIntervalTarget(row.target);
    if (parsed.kind === "interval") {
      setTimerMode("interval");
      setWorkSec(parsed.workSec);
      setRestSec(parsed.restSec);
      setRounds(parsed.rounds ?? 3);
    } else if (parsed.kind === "emom") {
      setTimerMode("emom");
      setRoundSec(parsed.roundSec);
      setReps(parsed.reps ?? "");
    } else {
      setTimerMode("straight");
    }
    setTimerRowId(row.id);
  }

  function saveRowTimer() {
    if (!timerRowId) return;
    let target: string | null = null;
    if (timerMode === "interval") {
      target = buildIntervalTarget(workSec, restSec, rounds);
    } else if (timerMode === "emom") {
      target = buildEmomTarget(roundSec, reps === "" ? undefined : reps);
    }
    setSessionExerciseTarget(timerRowId, target).then(afterMutation);
    setTimerRowId(null);
  }

  function openCircuitHeaderEdit(block: Extract<Block, { kind: "circuit" }>) {
    setHeaderEdit({
      kind: "circuit",
      firstRowId: block.rows[0].id,
      workSec: block.workSec,
      restSec: block.restSec,
      currentRounds: block.rounds,
    });
  }

  function openEmomHeaderEdit(block: Extract<Block, { kind: "emom" }>) {
    setHeaderEdit({
      kind: "emom",
      rows: block.rows.map((r) => {
        const p = parseIntervalTarget(r.target);
        return { id: r.id, reps: p.kind === "emom" ? p.reps : null };
      }),
      currentRoundSec: block.roundSec,
    });
  }

  function saveHeaderEdit() {
    if (!headerEdit) return;
    if (headerEdit.kind === "circuit") {
      const target = buildIntervalTarget(headerEdit.workSec, headerEdit.restSec, headerEdit.currentRounds);
      setSessionExerciseTarget(headerEdit.firstRowId, target).then(afterMutation);
    } else {
      Promise.all(
        headerEdit.rows.map((r) =>
          setSessionExerciseTarget(r.id, buildEmomTarget(headerEdit.currentRoundSec, r.reps ?? undefined))
        )
      ).then(afterMutation);
    }
    setHeaderEdit(null);
  }

  function openCircuitRowEdit(block: Extract<Block, { kind: "circuit" }>, row: Row, isFirst: boolean) {
    const own = parseIntervalTarget(row.target);
    const work = own.kind === "interval" ? own.workSec : block.workSec;
    const rest = own.kind === "interval" ? own.restSec : block.restSec;
    setRowEdit({
      rowId: row.id,
      mode: "workrest",
      prefillWork: work,
      prefillRest: rest,
      preserveRounds: isFirst ? block.rounds : undefined,
    });
  }

  function openIntervalRowEdit(row: Row, fallbackRounds: number) {
    const own = parseIntervalTarget(row.target);
    setRowEdit({
      rowId: row.id,
      mode: "workrest",
      prefillWork: own.kind === "interval" ? own.workSec : 40,
      prefillRest: own.kind === "interval" ? own.restSec : 20,
      preserveRounds: own.kind === "interval" ? own.rounds ?? fallbackRounds : fallbackRounds,
    });
  }

  function openEmomRowEdit(row: Row, roundSecToKeep: number) {
    const own = parseIntervalTarget(row.target);
    setRowEdit({
      rowId: row.id,
      mode: "emomReps",
      prefillReps: own.kind === "emom" ? own.reps ?? "" : "",
      roundSecToKeep,
    });
  }

  function saveRowEdit(work: number, rest: number, repsVal: number | "") {
    if (!rowEdit) return;
    const target =
      rowEdit.mode === "emomReps"
        ? buildEmomTarget(rowEdit.roundSecToKeep, repsVal === "" ? undefined : repsVal)
        : buildIntervalTarget(work, rest, rowEdit.preserveRounds);
    setSessionExerciseTarget(rowEdit.rowId, target).then(afterMutation);
    setRowEdit(null);
  }

  function openDetailsEdit(row: Row, opts?: { showSets?: boolean; showReps?: boolean }) {
    setDetailsEdit({
      rowId: row.id,
      sets: row.sets ?? "",
      reps: row.reps ?? "",
      loadValue: row.loadValue ?? "",
      loadUnit: row.loadUnit ?? "KG",
      coachNote: row.coachNote ?? "",
      showSets: opts?.showSets ?? true,
      showReps: opts?.showReps ?? true,
    });
  }

  function saveDetailsEdit(sets: number | "", repsVal: number | "", loadValue: number | "", loadUnit: Units, coachNote: string) {
    if (!detailsEdit) return;
    setSessionExerciseDetails(detailsEdit.rowId, {
      sets: sets === "" ? 0 : sets,
      reps: repsVal === "" ? 0 : repsVal,
      loadValue: loadValue === "" ? 0 : loadValue,
      loadUnit,
      coachNote: coachNote.trim() === "" ? null : coachNote,
    }).then(afterMutation);
    setDetailsEdit(null);
  }

  function deleteOne(id: string) {
    deleteSessionExercises([id]).then(afterMutation);
  }

  return (
    <div className="w-1/2 border-r p-4 relative">
      <SessionTitle
        sessionId={session.id}
        dayLabel={session.dayLabel}
        onSaved={afterMutation}
      />
      {isTemplateSession ? (
        <div className="mb-2 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1">
          <span className="text-[10px] text-amber-700 font-medium">
            {locked ? "📋 Template — read only" : "📋 Template — editing"}
          </span>
          <button
            onClick={() => setTemplateLocked(!templateLocked)}
            className="text-[10px] text-amber-700 underline hover:text-amber-900 ml-3 shrink-0"
          >
            {locked ? "Edit" : "Lock"}
          </button>
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-1.5 rounded border border-blue-100 bg-blue-50 px-2 py-1">
          <span className="text-[10px] text-blue-600 font-medium">Client session</span>
        </div>
      )}
      <p className="text-xs text-neutral-400 mb-3">
        Click-drag down across rows to select, release to group as a superset.
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-neutral-400">
          No exercises in this session yet — go to the Exercises tab on the
          left and click one to add it here.
        </p>
      ) : (
        <div className="flex flex-col gap-2 select-none" onMouseUp={finishSelect}>
          {blocks.map((block) => {
            if (block.kind === "single") {
              const { row, index } = block;
              return (
                <RowLine
                  key={row.id}
                  row={row}
                  index={index}
                  selected={isRowInSelection(index)}
                          locked={locked}
                  onMouseDown={(e) => startSelect(e, index)}
                  onMouseEnter={() => extendSelect(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  onDragStart={() => { setDragIndex(index); setDragBlockKey(null); }}
                  rightLabel={row.target ?? undefined}
                  onEditTimer={() => openTimerEditor(row)}
                  onEditDetails={() => openDetailsEdit(row)}
                  onDelete={() => deleteOne(row.id)}
                  detailsLabel={detailsSummary(row)}
                />
              );
            }

            if (block.kind === "plainGroup") {
              return (
                <div
                  key={block.rows[0].id}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: block.color ?? undefined }}
                >
                  <div
                    draggable={!locked}
                    onDragStart={locked ? undefined : () => { setDragBlockKey(block.rows[0].id); setDragIndex(null); }}
                    onDragOver={locked ? undefined : (e) => e.preventDefault()}
                    onDrop={locked ? undefined : () => handleDrop(block.indices[0])}
                    className={`w-full px-2 py-1.5 text-xs font-medium ${locked ? "cursor-default" : "cursor-grab"}`}
                    style={{ backgroundColor: block.color ?? "#f5f5f5" }}
                    title={locked ? "Superset" : "Drag to move this superset"}
                  >
                    Superset
                  </div>
                  <div className="flex flex-col gap-1 p-1">
                    {block.rows.map((row, k) => {
                      const index = block.indices[k];
                      return (
                        <RowLine
                          key={row.id}
                          row={row}
                          index={index}
                          selected={isRowInSelection(index)}
                          locked={locked}
                          onMouseDown={(e) => startSelect(e, index)}
                          onMouseEnter={() => extendSelect(index)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(index)}
                          onDragStart={() => { setDragIndex(index); setDragBlockKey(null); }}
                          rightLabel={row.target ?? undefined}
                          onEditTimer={() => openTimerEditor(row)}
                          onEditDetails={() => openDetailsEdit(row)}
                          onDelete={() => deleteOne(row.id)}
                          detailsLabel={detailsSummary(row)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }

            const headerLabel =
              block.kind === "circuit"
                ? `Circuit for ${block.rounds} round${block.rounds === 1 ? "" : "s"}`
                : block.kind === "interval"
                ? "Interval"
                : `EMOM for ${block.roundSec} sec`;

            const headerClickable = block.kind === "circuit" || block.kind === "emom";

            return (
              <div
                key={block.rows[0].id}
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: block.color ?? undefined }}
              >
                <button
                  draggable={!locked}
                  onDragStart={locked ? undefined : () => { setDragBlockKey(block.rows[0].id); setDragIndex(null); }}
                  onDragOver={locked ? undefined : (e) => e.preventDefault()}
                  onDrop={locked ? undefined : () => handleDrop(block.indices[0])}
                  onClick={
                    locked ? undefined
                      : block.kind === "circuit"
                      ? () => openCircuitHeaderEdit(block)
                      : block.kind === "emom"
                      ? () => openEmomHeaderEdit(block)
                      : undefined
                  }
                  className={`w-full text-left px-2 py-1.5 text-xs font-medium ${
                    locked ? "cursor-default" : headerClickable ? "cursor-grab hover:brightness-95" : "cursor-grab"
                  }`}
                  style={{ backgroundColor: block.color ?? "#f5f5f5" }}
                  title={locked ? headerLabel : "Drag to move this group"}
                >
                  {headerLabel}
                </button>
                <div className="flex flex-col gap-1 p-1">
                  {block.rows.map((row, k) => {
                    const index = block.indices[k];
                    const isFirst = k === 0;
                    const own = parseIntervalTarget(row.target);

                    let displayTime = "";
                    if (block.kind === "circuit") {
                      const w = own.kind === "interval" ? own.workSec : block.workSec;
                      const r = own.kind === "interval" ? own.restSec : block.restSec;
                      displayTime = `${w}/${r}`;
                    } else if (block.kind === "interval") {
                      displayTime = own.kind === "interval" ? `${own.workSec}/${own.restSec}` : "—";
                    } else if (block.kind === "emom") {
                      const repsVal = own.kind === "emom" ? own.reps : null;
                      displayTime = repsVal ? `${repsVal} reps` : "set reps";
                    }

                    const showSets = block.kind === "interval";
                    const showReps = block.kind !== "emom";
                    const dLabel = detailsSummary(row);

                    return (
                      <div
                        key={row.id}
                        onMouseDown={(e) => startSelect(e, index)}
                        onMouseEnter={() => extendSelect(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        className={`relative flex items-center gap-2 rounded px-2 py-1.5 text-sm bg-white ${
                          isRowInSelection(index) ? "bg-blue-50" : ""
                        }`}
                      >
                        <span
                          draggable
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={() => { setDragIndex(index); setDragBlockKey(null); }}
                          className="cursor-grab select-none text-neutral-400"
                          title="Drag to reorder"
                        >
                          ⠿
                        </span>
                        <span
                          data-role="exercise-name"
                          className="flex-1 cursor-pointer hover:underline"
                        >
                          {row.exercise.name}
                        </span>
                        {dLabel && <span className="text-[10px] text-neutral-400">{dLabel}</span>}
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => openDetailsEdit(row, { showSets, showReps })}
                          className="text-[11px] text-neutral-400 hover:text-neutral-700 underline"
                        >
                          Details
                        </button>
                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() =>
                            block.kind === "circuit"
                              ? openCircuitRowEdit(block, row, isFirst)
                              : block.kind === "interval"
                              ? openIntervalRowEdit(row, 3)
                              : openEmomRowEdit(row, block.roundSec)
                          }
                          className="text-[11px] text-neutral-500 hover:text-neutral-800 underline"
                        >
                          {displayTime}
                        </button>
                        <RowMenuButton onDelete={() => deleteOne(row.id)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {groupPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setGroupPopup(null)} />
          <div
            className="fixed z-50 flex gap-1 rounded-lg border bg-white p-2 shadow-lg"
            style={{ left: groupPopup.x, top: groupPopup.y }}
          >
            {groupPopup.stage === "color" && (
              <>
                {PALETTE.map((color) => {
                  const disabled = groupPopup.disabledColors.includes(color);
                  return (
                    <button
                      key={color}
                      onClick={() => !disabled && pickColor(color)}
                      disabled={disabled}
                      className={`h-6 w-6 rounded-full border ${disabled ? "opacity-25 cursor-not-allowed" : ""}`}
                      style={{ backgroundColor: color }}
                      title={disabled ? "Too close to an adjacent superset color" : color}
                    />
                  );
                })}
                <button
                  onClick={deleteSelection}
                  className="h-6 w-6 rounded-full border flex items-center justify-center text-xs hover:bg-red-50"
                  title="Delete selected"
                >
                  🗑
                </button>
              </>
            )}

            {groupPopup.stage === "straightOrTimed" && (
              <>
                <button onClick={pickStraight} className="text-xs px-3 py-1 rounded border hover:bg-neutral-100">
                  Straight
                </button>
                <button onClick={pickTimed} className="text-xs px-3 py-1 rounded border hover:bg-neutral-100">
                  Timed
                </button>
              </>
            )}

            {groupPopup.stage === "timerType" && (
              <>
                <button onClick={() => pickTimerType("circuit")} className="text-xs px-3 py-1 rounded border hover:bg-neutral-100">
                  Circuit
                </button>
                <button onClick={() => pickTimerType("interval")} className="text-xs px-3 py-1 rounded border hover:bg-neutral-100">
                  Interval
                </button>
                <button onClick={() => pickTimerType("emom")} className="text-xs px-3 py-1 rounded border hover:bg-neutral-100">
                  EMOM
                </button>
              </>
            )}
          </div>
        </>
      )}

      {groupTimerForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setGroupTimerForm(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 rounded-lg border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium mb-3">
              {groupTimerForm.type === "circuit" ? "Circuit" : groupTimerForm.type === "interval" ? "Interval" : "EMOM"} —{" "}
              {groupTimerForm.ids.length} exercises
            </p>

            {(groupTimerForm.type === "circuit" || groupTimerForm.type === "interval") && (
              <div className="flex flex-col gap-2 text-xs">
                <NumField label="Work (sec)" value={workSec} onChange={setWorkSec} />
                <NumField label="Rest (sec)" value={restSec} onChange={setRestSec} />
                <NumField label="Rounds" value={rounds} onChange={setRounds} />
              </div>
            )}

            {groupTimerForm.type === "emom" && (
              <div className="flex flex-col gap-2 text-xs">
                <NumField label="Round length (sec)" value={roundSec} onChange={setRoundSec} />
                <NumField label="Reps" value={reps} onChange={setReps} allowEmpty />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setGroupTimerForm(null)} className="text-xs px-3 py-1 rounded border">
                Cancel
              </button>
              <button onClick={saveGroupTimer} className="text-xs px-3 py-1 rounded bg-neutral-800 text-white">
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {timerRowId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setTimerRowId(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 rounded-lg border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium mb-3">Timer (this exercise only)</p>
            <div className="flex gap-1 mb-3 text-xs">
              {(["straight", "interval", "emom"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTimerMode(mode)}
                  className={`flex-1 py-1 rounded border ${timerMode === mode ? "bg-neutral-800 text-white" : ""}`}
                >
                  {mode === "straight" ? "Straight" : mode === "interval" ? "Interval" : "EMOM"}
                </button>
              ))}
            </div>
            {timerMode === "interval" && (
              <div className="flex flex-col gap-2 text-xs">
                <NumField label="Work (sec)" value={workSec} onChange={setWorkSec} />
                <NumField label="Rest (sec)" value={restSec} onChange={setRestSec} />
                <NumField label="Rounds" value={rounds} onChange={setRounds} />
              </div>
            )}
            {timerMode === "emom" && (
              <div className="flex flex-col gap-2 text-xs">
                <NumField label="Round length (sec)" value={roundSec} onChange={setRoundSec} />
                <NumField label="Reps" value={reps} onChange={setReps} allowEmpty />
              </div>
            )}
            {timerMode === "straight" && <p className="text-xs text-neutral-400">No timer — straight sets.</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTimerRowId(null)} className="text-xs px-3 py-1 rounded border">
                Cancel
              </button>
              <button onClick={saveRowTimer} className="text-xs px-3 py-1 rounded bg-neutral-800 text-white">
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {headerEdit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setHeaderEdit(null)} />
          <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 rounded-lg border bg-white p-4 shadow-lg">
            <p className="text-sm font-medium mb-3">
              {headerEdit.kind === "circuit" ? "Number of rounds" : "Round length (sec)"}
            </p>
            <input
              type="number"
              value={headerEdit.kind === "circuit" ? headerEdit.currentRounds : headerEdit.currentRoundSec}
              onChange={(e) =>
                setHeaderEdit(
                  headerEdit.kind === "circuit"
                    ? { ...headerEdit, currentRounds: Number(e.target.value) }
                    : { ...headerEdit, currentRoundSec: Number(e.target.value) }
                )
              }
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setHeaderEdit(null)} className="text-xs px-3 py-1 rounded border">
                Cancel
              </button>
              <button onClick={saveHeaderEdit} className="text-xs px-3 py-1 rounded bg-neutral-800 text-white">
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {rowEdit && <RowEditModal rowEdit={rowEdit} onCancel={() => setRowEdit(null)} onSave={saveRowEdit} />}

      {detailsEdit && (
        <DetailsModal
          detailsEdit={detailsEdit}
          onCancel={() => setDetailsEdit(null)}
          onSave={saveDetailsEdit}
        />
      )}
    </div>
  );
}

function SessionTitle({
  sessionId,
  dayLabel,
  onSaved,
}: {
  sessionId: string;
  dayLabel: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dayLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(dayLabel);
  }, [dayLabel]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function save() {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === dayLabel) {
      setValue(dayLabel);
      return;
    }
    setSessionDayLabel(sessionId, trimmed).then(onSaved);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            setValue(dayLabel);
            setEditing(false);
          }
        }}
        className="text-sm font-medium mb-1 border rounded px-1 -mx-1"
      />
    );
  }

  return (
    <p
      onClick={() => setEditing(true)}
      className="text-sm font-medium mb-1 cursor-pointer hover:bg-neutral-100 rounded px-1 -mx-1 inline-block"
      title="Click to rename"
    >
      {dayLabel}
    </p>
  );
}

function RowMenuButton({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        className="text-neutral-400 hover:text-neutral-700 px-1"
        title="More"
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 rounded border bg-white shadow-lg text-xs">
            <button
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}

function RowLine({
  row,
  index,
  selected,
  locked,
  onMouseDown,
  onMouseEnter,
  onDragOver,
  onDrop,
  onDragStart,
  rightLabel,
  onEditTimer,
  onEditDetails,
  onDelete,
  detailsLabel,
}: {
  row: Row;
  index: number;
  selected: boolean;
  locked?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragStart: () => void;
  rightLabel?: string;
  onEditTimer: () => void;
  onEditDetails: () => void;
  onDelete: () => void;
  detailsLabel: string | null;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDragOver={locked ? undefined : onDragOver}
      onDrop={locked ? undefined : onDrop}
      style={{ borderLeft: row.groupColor ? `4px solid ${row.groupColor}` : undefined }}
      className={`relative flex items-center gap-2 rounded border px-2 py-2 text-sm bg-white ${
        selected ? "bg-blue-50 border-blue-300" : ""
      }`}
    >
      {!locked && (
        <span
          draggable
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={onDragStart}
          className="cursor-grab select-none text-neutral-400"
          title="Drag to reorder"
        >
          ⠿
        </span>
      )}
      <span
        data-role="exercise-name"
        className="flex-1 cursor-pointer hover:underline"
      >
        {row.exercise.name}
      </span>
      {detailsLabel && <span className="text-[10px] text-neutral-400">{detailsLabel}</span>}
      {rightLabel && <span className="text-[10px] text-neutral-400">{rightLabel}</span>}
      {!locked && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onEditDetails}
          className="text-[11px] text-neutral-400 hover:text-neutral-700 underline"
        >
          Details
        </button>
      )}
      {!locked && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onEditTimer}
          className="text-[11px] text-neutral-400 hover:text-neutral-700 underline"
        >
          Timer
        </button>
      )}
      {!locked && <RowMenuButton onDelete={onDelete} />}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  allowEmpty,
  inputRef,
  onKeyDown,
}: {
  label: string;
  value: number | "";
  onChange: (v: any) => void;
  allowEmpty?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex justify-between items-center">
      {label}
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={(e) => onChange(allowEmpty && e.target.value === "" ? "" : Number(e.target.value))}
        onKeyDown={onKeyDown}
        className="w-20 rounded border px-2 py-1"
      />
    </label>
  );
}

function RowEditModal({
  rowEdit,
  onCancel,
  onSave,
}: {
  rowEdit: RowEditState;
  onCancel: () => void;
  onSave: (work: number, rest: number, reps: number | "") => void;
}) {
  const [work, setWork] = useState(rowEdit.mode === "workrest" ? rowEdit.prefillWork : 40);
  const [rest, setRest] = useState(rowEdit.mode === "workrest" ? rowEdit.prefillRest : 20);
  const [repsVal, setRepsVal] = useState<number | "">(rowEdit.mode === "emomReps" ? rowEdit.prefillReps : "");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onCancel} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-64 rounded-lg border bg-white p-4 shadow-lg">
        <p className="text-sm font-medium mb-3">{rowEdit.mode === "emomReps" ? "Reps" : "Work / Rest"}</p>
        {rowEdit.mode === "workrest" ? (
          <div className="flex flex-col gap-2 text-xs">
            <NumField label="Work (sec)" value={work} onChange={setWork} />
            <NumField label="Rest (sec)" value={rest} onChange={setRest} />
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <NumField label="Reps" value={repsVal} onChange={setRepsVal} allowEmpty />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="text-xs px-3 py-1 rounded border">
            Cancel
          </button>
          <button onClick={() => onSave(work, rest, repsVal)} className="text-xs px-3 py-1 rounded bg-neutral-800 text-white">
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function DetailsModal({
  detailsEdit,
  onCancel,
  onSave,
}: {
  detailsEdit: DetailsEditState;
  onCancel: () => void;
  onSave: (sets: number | "", reps: number | "", loadValue: number | "", loadUnit: Units, coachNote: string) => void;
}) {
  const [sets, setSets] = useState<number | "">(detailsEdit.sets);
  const [reps, setReps] = useState<number | "">(detailsEdit.reps);
  const [loadValue, setLoadValue] = useState<number | "">(detailsEdit.loadValue);
  const [loadUnit, setLoadUnit] = useState<Units>(detailsEdit.loadUnit);
  const [coachNote, setCoachNote] = useState(detailsEdit.coachNote);

  const setsRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const firstRef = detailsEdit.showSets ? setsRef : detailsEdit.showReps ? repsRef : weightRef;
    firstRef.current?.focus();
    firstRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goNext(e: React.KeyboardEvent<HTMLInputElement>, next: React.RefObject<HTMLInputElement> | null) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (next?.current) {
      next.current.focus();
      next.current.select();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onCancel} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 rounded-lg border bg-white p-4 shadow-lg">
        <p className="text-sm font-medium mb-3">Details</p>
        <div className="flex flex-col gap-2 text-xs">
          {detailsEdit.showSets && (
            <NumField
              label="Sets"
              value={sets}
              onChange={setSets}
              allowEmpty
              inputRef={setsRef}
              onKeyDown={(e) => goNext(e, detailsEdit.showReps ? repsRef : weightRef)}
            />
          )}
          {detailsEdit.showReps && (
            <NumField
              label="Reps"
              value={reps}
              onChange={setReps}
              allowEmpty
              inputRef={repsRef}
              onKeyDown={(e) => goNext(e, weightRef)}
            />
          )}
          <div className="flex justify-between items-center">
            <span>Weight</span>
            <div className="flex items-center gap-1">
              <input
                ref={weightRef}
                type="number"
                value={loadValue}
                onChange={(e) => setLoadValue(e.target.value === "" ? "" : Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  onSave(sets, reps, loadValue, loadUnit, coachNote);
                }}
                className="w-16 rounded border px-2 py-1"
              />
              <button
                onClick={() => setLoadUnit("KG")}
                className={`px-2 py-1 rounded border text-[10px] ${loadUnit === "KG" ? "bg-neutral-800 text-white" : ""}`}
              >
                KG
              </button>
              <button
                onClick={() => setLoadUnit("LB")}
                className={`px-2 py-1 rounded border text-[10px] ${loadUnit === "LB" ? "bg-neutral-800 text-white" : ""}`}
              >
                LB
              </button>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            Note
            <textarea
              value={coachNote}
              onChange={(e) => setCoachNote(e.target.value)}
              className="w-full rounded border px-2 py-1 text-xs"
              rows={2}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="text-xs px-3 py-1 rounded border">
            Cancel
          </button>
          <button
            onClick={() => onSave(sets, reps, loadValue, loadUnit, coachNote)}
            className="text-xs px-3 py-1 rounded bg-neutral-800 text-white"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}
