"use client";
// components/coach/CoachLiveSession.tsx
// Coach live-logging view — styled like TodayWorkout but with:
//   • + Set per exercise (extra set beyond prescribed, log-only)
//   • + Exercise (search → creates a real SessionExercise on this session,
//     appended at the end, same as the builder's add-exercise flow)
//   • Reorder — move whole exercises (or whole supersets) up/down among
//     each other; can't drop into the middle of a superset. Persists via
//     the same reorderSessionExercises action the builder uses.
// Logging goes to /api/coach/live/log-set (coach-role route).
// DrumPicker and value generators are copied verbatim from TodayWorkout.tsx for parity.

import { useState, useRef, useEffect, useMemo } from "react";
import type { Exercise, SessionExercise } from "@prisma/client";
import { addExerciseToSession } from "@/lib/actions/add-exercise-actions";
import { reorderSessionExercises } from "@/lib/actions/reorder-actions";
import { deleteSessionExercises } from "@/lib/actions/delete-actions";
import { deleteSetForSession } from "@/lib/actions/live-edit-actions";
import { joinExistingGroup } from "@/lib/actions/group-actions";
import { CoachBottomMenu } from "@/components/coach/CoachBottomMenu";
import { ExerciseDrawer, type DropTarget } from "@/components/coach/ExerciseDrawer";

// ─── Exercise media (GIF or WEBM) — same pattern as client TodayWorkout ────────

function isVideoUrl(url: string) {
  return /\.(webm|mp4)(\?|#|$)/i.test(url);
}

function ExerciseMedia({ url, name, style }: { url: string; name: string; style?: React.CSSProperties }) {
  if (isVideoUrl(url)) {
    return <video src={url} autoPlay loop muted playsInline style={style} />;
  }
  return <img src={url} alt={name} style={style} />;
}

function GifOverlay({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ExerciseMedia url={url} name={name} style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }} />
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", fontSize: 22, width: 40, height: 40, borderRadius: 20, cursor: "pointer" }}>✕</button>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Units = "KG" | "LB";

type LiveExercise = SessionExercise & {
  exercise: Exercise;
  loggedSets: { setIndex: number; weight: number | null; reps: number | null }[];
};

type SetState = { weight: number; reps: number; done: boolean; isPr?: boolean };

// A block is either a single exercise or a run of consecutive exercises
// sharing the same non-null groupId (a superset). Blocks are the unit of
// reordering — you can move a whole block, never split one apart.
type Block =
  | { kind: "single"; ex: LiveExercise; index: number }
  | { kind: "group"; exs: LiveExercise[]; indices: number[]; color: string | null };

function buildBlocks(list: LiveExercise[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < list.length) {
    const ex = list[i];
    if (!ex.groupId) {
      blocks.push({ kind: "single", ex, index: i });
      i++;
      continue;
    }
    let j = i;
    const groupExs: LiveExercise[] = [];
    const indices: number[] = [];
    while (j < list.length && list[j].groupId === ex.groupId) {
      groupExs.push(list[j]);
      indices.push(j);
      j++;
    }
    blocks.push({ kind: "group", exs: groupExs, indices, color: groupExs[0].groupColor });
    i = j;
  }
  return blocks;
}

function blockKeyOf(b: Block): string {
  return b.kind === "single" ? b.ex.id : b.exs[0].id;
}

function flattenBlocks(blocks: Block[]): LiveExercise[] {
  const out: LiveExercise[] = [];
  for (const b of blocks) {
    if (b.kind === "single") out.push(b.ex);
    else out.push(...b.exs);
  }
  return out;
}

// ─── Value generators (verbatim from TodayWorkout.tsx) ────────────────────────

function makeWeightValues(center: number): number[] {
  const vals: number[] = [];
  for (let v = Math.max(0, center - 75); v <= center + 75; v += 2.5) vals.push(Math.round(v * 10) / 10);
  return vals;
}

function makeRepValues(center: number): number[] {
  const vals: number[] = [];
  for (let v = Math.max(1, center - 10); v <= center + 10; v++) vals.push(v);
  return vals;
}

// ─── Drum picker (verbatim from TodayWorkout.tsx) ──────────────────────────────

function DrumPicker({ values, initial, onConfirm, onClose, label }: {
  values: number[]; initial: number; onConfirm: (v: number) => void; onClose: () => void; label: string;
}) {
  const ITEM_H = 48;
  const VISIBLE = 5;
  const PAD = ITEM_H * Math.floor(VISIBLE / 2);

  const [selected, setSelected] = useState(() => { const idx = values.indexOf(initial); return idx >= 0 ? idx : 0; });
  const [manual, setManual] = useState(false);
  const [manualVal, setManualVal] = useState(String(initial));
  const listRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (listRef.current && !isScrolling.current) {
      listRef.current.scrollTop = selected * ITEM_H;
    }
  }, [selected, ITEM_H]);

  function onScroll() {
    if (!listRef.current) return;
    isScrolling.current = true;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(listRef.current.scrollTop / ITEM_H)));
    setSelected(idx);
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = idx * ITEM_H;
      isScrolling.current = false;
    }, 80);
  }

  function onWheel(e: React.WheelEvent) { e.stopPropagation(); }
  function onTouchMove(e: React.TouchEvent) { e.stopPropagation(); }
  function pick(idx: number) { onConfirm(values[idx]); onClose(); }
  function submitManual() { const v = parseFloat(manualVal); if (!isNaN(v)) { onConfirm(v); onClose(); } }

  return (
    <div
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,.65)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          paddingBottom: "env(safe-area-inset-bottom, 20px)",
          background: "var(--panel)", borderRadius: "18px 18px 0 0",
          zIndex: 1002,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)", padding: "18px 20px 12px", textAlign: "center" }}>{label}</div>

        {!manual ? (
          <div style={{ position: "relative", height: ITEM_H * VISIBLE, overflow: "hidden", margin: "0 20px" }}>
            <div style={{ position: "absolute", top: PAD, left: 0, right: 0, height: ITEM_H, background: "rgba(255,255,255,.07)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", pointerEvents: "none", borderRadius: 8, zIndex: 1 }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: PAD, background: "linear-gradient(to bottom, var(--panel), transparent)", pointerEvents: "none", zIndex: 2 }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: PAD, background: "linear-gradient(to top, var(--panel), transparent)", pointerEvents: "none", zIndex: 2 }} />
            <div
              ref={listRef}
              onScroll={onScroll}
              onWheel={onWheel}
              onTouchMove={onTouchMove}
              style={{
                height: "100%",
                overflowY: "scroll",
                scrollbarWidth: "none",
                overscrollBehavior: "contain",
                paddingTop: PAD,
                paddingBottom: PAD,
              }}
            >
              {values.map((v, i) => {
                const dist = Math.abs(i - selected);
                const scale = dist === 0 ? 1 : dist === 1 ? 0.82 : 0.68;
                const opacity = dist === 0 ? 1 : dist === 1 ? 0.55 : 0.3;
                return (
                  <div
                    key={i}
                    onClick={() => pick(i)}
                    style={{
                      height: ITEM_H,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28,
                      fontWeight: dist === 0 ? 800 : 500,
                      color: dist === 0 ? "var(--text)" : "var(--dim)",
                      fontFamily: "monospace",
                      transform: `scale(${scale})`,
                      opacity,
                      transition: "transform .12s, opacity .12s",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    {v % 1 === 0 ? v : v.toFixed(1)}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 20px", display: "flex", gap: 8 }}>
            <input type="number" value={manualVal} onChange={(e) => setManualVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitManual()} autoFocus
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)", fontSize: 24, fontWeight: 700, padding: "12px 16px", textAlign: "center", fontFamily: "monospace" }} />
            <button onClick={submitManual} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--good)", color: "#0c1a10", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✓</button>
          </div>
        )}

        <div style={{ padding: "12px 20px 8px" }}>
          <button onClick={() => setManual((v) => !v)} style={{ display: "block", background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "9px 24px", borderRadius: 10, width: "100%" }}>
            {manual ? "← Back to scroll" : "Type a number"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({
  s, i, unit,
  editMode,
  onPicker,
  onUncheck,
  onCheck,
  onDelete,
}: {
  s: SetState; i: number; unit: Units;
  editMode: boolean;
  onPicker: (field: "weight" | "reps") => void;
  onUncheck: () => void;
  onCheck: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "var(--dim)", fontFamily: "monospace", width: 18, flexShrink: 0 }}>{i + 1}</span>
      <button onClick={() => onPicker("weight")} style={{ width: 76, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: s.weight ? "var(--text)" : "var(--dim)", fontSize: 16, fontWeight: 800, padding: "5px 0", textAlign: "center", cursor: "pointer", fontFamily: "monospace", flexShrink: 0 }}>
        {s.weight ? (s.weight % 1 === 0 ? s.weight : s.weight.toFixed(1)) : unit.toLowerCase()}
      </button>
      <span style={{ fontSize: 13, color: "var(--dim)", flexShrink: 0 }}>×</span>
      <button onClick={() => onPicker("reps")} style={{ width: 60, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: s.reps ? "var(--text)" : "var(--dim)", fontSize: 16, fontWeight: 800, padding: "5px 0", textAlign: "center", cursor: "pointer", fontFamily: "monospace", flexShrink: 0 }}>
        {s.reps || "reps"}
      </button>
      <button onClick={() => s.done ? onUncheck() : onCheck()} style={{ width: 32, height: 32, borderRadius: 8, border: s.done ? "none" : "2px solid var(--line)", background: s.done ? "var(--good)" : "transparent", color: s.done ? "#0c1a10" : "var(--line)", fontSize: 18, fontWeight: 900, flexShrink: 0, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✓</button>
      {editMode && (
        <button onClick={onDelete} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 13, fontWeight: 900, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      )}
    </div>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  ex, sessionId, clientId, defaultUnit, editMode, onDeleteExercise,
}: {
  ex: LiveExercise;
  sessionId: string;
  clientId: string;
  defaultUnit: Units;
  editMode: boolean;
  onDeleteExercise: () => void;
}) {
  const sessionExerciseId = ex.id;
  const exerciseId = ex.exerciseId;
  const prescribedSets = ex.sets ?? 1;
  const prescribedReps = ex.reps ?? null;
  const prescribedWeight = ex.loadValue ?? null;
  const unit: Units = (ex.loadUnit as Units) ?? defaultUnit;
  const name = ex.exercise.name;

  const existingLogs = ex.loggedSets;

  const [sets, setSets] = useState<SetState[]>(() =>
    Array.from({ length: prescribedSets }, (_, i) => {
      const logged = existingLogs.find((l) => l.setIndex === i);
      return {
        weight: logged?.weight ?? prescribedWeight ?? 0,
        reps: logged?.reps ?? prescribedReps ?? 0,
        done: !!logged,
      };
    })
  );

  const [picker, setPicker] = useState<{ setIdx: number; field: "weight" | "reps" } | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const gifUrl = ex.exercise.gifUrl;

  async function doLog(idx: number, currentSets: SetState[]) {
    const s = currentSets[idx];
    const weight = s.weight || prescribedWeight || null;
    const reps = s.reps || prescribedReps || null;
    setSets((prev) => prev.map((ss, i) => i === idx ? { ...ss, done: true } : ss));
    try {
      await fetch("/api/coach/live/log-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          sessionExerciseId,
          sessionId,
          exerciseId,
          setIndex: idx,
          weight,
          reps,
        }),
      });
    } catch {
      // silent fail — stays green
    }
  }

  async function doUnlog(idx: number) {
    setSets((prev) => prev.map((ss, i) => i === idx ? { ...ss, done: false } : ss));
    try {
      await fetch("/api/coach/live/log-set", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, sessionExerciseId, setIndex: idx }),
      });
    } catch {
      setSets((prev) => prev.map((ss, i) => i === idx ? { ...ss, done: true } : ss));
    }
  }

  function handlePickerConfirm(v: number) {
    const { field, setIdx } = picker!;
    setSets((prev) => {
      const next = prev.map((ss, i) => i === setIdx ? { ...ss, [field]: v } : ss);
      if (field === "reps") doLog(setIdx, next);
      return next;
    });
  }

  function addSet() {
    setSets((prev) => [...prev, { weight: prev[prev.length - 1]?.weight ?? prescribedWeight ?? 0, reps: prev[prev.length - 1]?.reps ?? prescribedReps ?? 0, done: false }]);
  }

  async function doDeleteSet(idx: number) {
    setSets((prev) => prev.filter((_, i) => i !== idx));
    await deleteSetForSession(sessionExerciseId, idx);
  }

  const doneSets = sets.filter((s) => s.done).length;

  return (
    <div style={{ background: "var(--panel)", borderRadius: 14, padding: "14px 14px 10px", border: "1px solid var(--line)" }}>
      {gifOpen && gifUrl && <GifOverlay url={gifUrl} name={name} onClose={() => setGifOpen(false)} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            onClick={() => gifUrl && setGifOpen(true)}
            style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--dim)", cursor: gifUrl ? "zoom-in" : "default" }}
          >
            {gifUrl ? <ExerciseMedia url={gifUrl} name={name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "💪"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{name}</div>
            {prescribedSets && prescribedReps && (
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                {prescribedSets}×{prescribedReps}{prescribedWeight ? ` @ ${prescribedWeight}${unit.toLowerCase()}` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: doneSets === sets.length && sets.length > 0 ? "var(--good)" : "var(--dim)" }}>
            {doneSets}/{sets.length}
          </span>
          {editMode && (
            <button onClick={onDeleteExercise} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          )}
        </div>
      </div>

      {sets.map((s, i) => (
        <SetRow
          key={i}
          s={s}
          i={i}
          unit={unit}
          editMode={editMode}
          onPicker={(field) => setPicker({ setIdx: i, field })}
          onUncheck={() => doUnlog(i)}
          onCheck={() => {
            setSets((prev) => {
              const next = prev.map((ss, j) => j === i ? { ...ss } : ss);
              doLog(i, next);
              return next;
            });
          }}
          onDelete={() => doDeleteSet(i)}
        />
      ))}

      <button
        onClick={addSet}
        style={{ marginTop: 4, width: "100%", height: 34, borderRadius: 9, border: "1px dashed var(--line)", background: "none", color: "var(--dim)", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: ".03em" }}
      >
        + Set
      </button>

      {picker && (
        <DrumPicker
          label={picker.field === "weight" ? `Weight (${unit.toLowerCase()})` : "Reps"}
          values={picker.field === "weight" ? makeWeightValues(sets[picker.setIdx].weight || prescribedWeight || 0) : makeRepValues(sets[picker.setIdx].reps || prescribedReps || 1)}
          initial={picker.field === "weight" ? (sets[picker.setIdx].weight || prescribedWeight || 0) : (sets[picker.setIdx].reps || prescribedReps || 1)}
          onConfirm={handlePickerConfirm}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ─── Block wrapper (single card or grouped superset, with reorder arrows) ─────

function BlockWrapper({
  block, sessionId, clientId, defaultUnit,
  editMode, onDeleteExercise, onReorderGroup,
}: {
  block: Block;
  sessionId: string;
  clientId: string;
  defaultUnit: Units;
  editMode: boolean;
  onDeleteExercise: (sessionExerciseId: string) => void;
  onReorderGroup: (newExs: LiveExercise[]) => void;
}) {
  const exs = block.kind === "single" ? [block.ex] : block.exs;

  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const pendingRef = useRef<{ pointerId: number; startX: number; startY: number; idx: number; dragging: boolean } | null>(null);

  function onHandleDown(e: React.PointerEvent, idx: number) {
    pendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, idx, dragging: false };
  }

  function onHandleMove(e: React.PointerEvent, el: HTMLElement) {
    const p = pendingRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < 12) return;
      p.dragging = true;
      try { el.setPointerCapture(p.pointerId); } catch {}
      setDragIdx(p.idx);
    }
    let best = 0, bestDist = Infinity;
    rowRefs.current.forEach((r, i) => {
      if (!r) return;
      const rect = r.getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      const d = Math.abs(mid - e.clientY);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setOverIdx(best);
  }

  function onHandleUp() {
    const p = pendingRef.current;
    if (p && p.dragging && overIdx !== null && overIdx !== p.idx && block.kind === "group") {
      const newExs = [...exs];
      const [moved] = newExs.splice(p.idx, 1);
      newExs.splice(overIdx, 0, moved);
      onReorderGroup(newExs);
    }
    pendingRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {block.kind === "group" && (
        <div style={{ margin: "0 0 4px 2px", padding: "2px 8px", borderRadius: 4, background: block.color ?? "#5c7a8a", fontSize: 9, fontWeight: 700, color: "#fff", display: "inline-block", letterSpacing: ".04em", textTransform: "uppercase" }}>
          Superset
        </div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: block.kind === "group" ? 6 : 0 }}>
        {exs.map((ex, idx) => (
          <div
            key={ex.id}
            ref={(el) => { rowRefs.current[idx] = el; }}
            style={{
              position: "relative",
              paddingLeft: block.kind === "group" && editMode ? 22 : 0,
              outline: overIdx === idx && dragIdx !== null && dragIdx !== idx ? "2px solid var(--good)" : "none",
              outlineOffset: 2,
              borderRadius: 14,
              opacity: dragIdx === idx ? 0.5 : 1,
            }}
          >
            {block.kind === "group" && editMode && (
              <button
                onPointerDown={(e) => onHandleDown(e, idx)}
                onPointerMove={(e) => onHandleMove(e, e.currentTarget)}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                style={{
                  position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)",
                  width: 22, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--dim)", fontSize: 14, cursor: "grab", touchAction: "none",
                  background: "transparent", border: "none", zIndex: 5,
                }}
              >
                ⋮⋮
              </button>
            )}
            <ExerciseCard
              ex={ex}
              sessionId={sessionId}
              clientId={clientId}
              defaultUnit={defaultUnit}
              editMode={editMode}
              onDeleteExercise={() => onDeleteExercise(ex.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type SessionData = {
  id: string;
  dayLabel: string | null;
  date: string | null;
  sessionExercises: LiveExercise[];
};

export default function CoachLiveSession({
  session,
  clientId,
  clientName,
  allExercises,
  defaultUnit = "KG",
}: {
  session: SessionData;
  clientId: string;
  clientName: string;
  allExercises: Exercise[];
  defaultUnit?: Units;
}) {
  const [exercises, setExercises] = useState<LiveExercise[]>(
    [...session.sessionExercises].sort((a, b) => a.order - b.order)
  );
  const [editMode, setEditMode] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  const blocks = useMemo(() => buildBlocks(exercises), [exercises]);

  function resolveDropTarget(x: number, y: number): DropTarget | null {
    const container = listRef.current;
    if (!container) return null;

    // First: is the point inside a superset card? Join that group.
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind !== "group") continue;
      const el = blockRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        return { type: "group", groupId: b.exs[0].groupId as string, groupColor: b.color, top: r.top, bottom: r.bottom, left: r.left, width: r.width };
      }
    }

    // Otherwise: nearest gap between blocks → new single block there.
    const rects = blockRefs.current
      .slice(0, blocks.length)
      .map((el) => el?.getBoundingClientRect() ?? null);
    const valid = rects.filter(Boolean) as DOMRect[];
    const cRect = container.getBoundingClientRect();

    if (valid.length === 0) {
      return { type: "gap", index: 0, y: cRect.top + 24, left: cRect.left, width: cRect.width };
    }
    const gapYs: number[] = [valid[0].top - 6];
    for (let i = 0; i < valid.length - 1; i++) gapYs.push((valid[i].bottom + valid[i + 1].top) / 2);
    gapYs.push(valid[valid.length - 1].bottom + 6);

    let bestIdx = 0, bestDist = Infinity;
    gapYs.forEach((gy, i) => { const d = Math.abs(gy - y); if (d < bestDist) { bestDist = d; bestIdx = i; } });

    return { type: "gap", index: bestIdx, y: gapYs[bestIdx], left: cRect.left, width: cRect.width };
  }

  async function handleDrawerDrop(ex: Exercise, target: DropTarget) {
    const created = await addExerciseToSession(session.id, ex.id);
    if (!created) return;
    const newRow: LiveExercise = { ...(created as any), exercise: ex, loggedSets: [] };

    if (target.type === "group") {
      newRow.groupId = target.groupId;
      newRow.groupColor = target.groupColor;
      setExercises((prev) => {
        const blockList = buildBlocks(prev);
        const idx = blockList.findIndex((b) => b.kind === "group" && b.exs[0].groupId === target.groupId);
        if (idx === -1) return prev;
        const gb = blockList[idx] as { kind: "group"; exs: LiveExercise[]; indices: number[]; color: string | null };
        blockList[idx] = { ...gb, exs: [...gb.exs, newRow] };
        const flattened = flattenBlocks(blockList);
        reorderSessionExercises(flattened.map((e) => e.id));
        joinExistingGroup(newRow.id, target.groupId, target.groupColor);
        return flattened;
      });
    } else {
      setExercises((prev) => {
        const blockList = buildBlocks(prev);
        blockList.splice(target.index, 0, { kind: "single", ex: newRow, index: -1 });
        const flattened = flattenBlocks(blockList);
        reorderSessionExercises(flattened.map((e) => e.id));
        return flattened;
      });
    }
  }

  function handleReorderBlocks(newBlocks: Block[]) {
    const newList = flattenBlocks(newBlocks);
    setExercises(newList);
    reorderSessionExercises(newList.map((e) => e.id));
  }

  const [blockDragIdx, setBlockDragIdx] = useState<number | null>(null);
  const [blockOverIdx, setBlockOverIdx] = useState<number | null>(null);
  const blockPendingRef = useRef<{ pointerId: number; startX: number; startY: number; idx: number; dragging: boolean } | null>(null);

  function onBlockHandleDown(e: React.PointerEvent, idx: number) {
    blockPendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, idx, dragging: false };
  }

  function onBlockHandleMove(e: React.PointerEvent, el: HTMLElement) {
    const p = blockPendingRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dx = e.clientX - p.startX, dy = e.clientY - p.startY;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < 12) return;
      p.dragging = true;
      try { el.setPointerCapture(p.pointerId); } catch {}
      setBlockDragIdx(p.idx);
    }
    let best = 0, bestDist = Infinity;
    blockRefs.current.slice(0, blocks.length).forEach((r, i) => {
      if (!r) return;
      const rect = r.getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      const d = Math.abs(mid - e.clientY);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setBlockOverIdx(best);
  }

  function onBlockHandleUp() {
    const p = blockPendingRef.current;
    if (p && p.dragging && blockOverIdx !== null && blockOverIdx !== p.idx) {
      const newBlocks = [...blocks];
      const [moved] = newBlocks.splice(p.idx, 1);
      newBlocks.splice(blockOverIdx, 0, moved);
      handleReorderBlocks(newBlocks);
    }
    blockPendingRef.current = null;
    setBlockDragIdx(null);
    setBlockOverIdx(null);
  }

  async function handleDeleteExercise(sessionExerciseId: string) {
    setExercises((prev) => prev.filter((e) => e.id !== sessionExerciseId));
    await deleteSessionExercises([sessionExerciseId]);
  }

  function handleReorderGroup(blockIdx: number, newExs: LiveExercise[]) {
    const newBlocks = [...blocks];
    const b = newBlocks[blockIdx];
    if (b.kind !== "group") return;
    newBlocks[blockIdx] = { ...b, exs: newExs };
    const newList = flattenBlocks(newBlocks);
    setExercises(newList);
    reorderSessionExercises(newList.map((e) => e.id));
  }

  const sessionLabel = session.dayLabel ?? (session.date ? new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Session");
  const totalExercises = exercises.length;

  return (
    <>
      <style>{`
        :root{--bg:#14161a;--panel:#1c1f24;--line:#2a2e35;--text:#edeae4;--dim:#8a8f98;--accent:#ff4b3e;--accent-dim:#5c1f19;--steel:#5c7a8a;--good:#54c17a;--blue:#2e8fff;}
        body{background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
      `}</style>

      <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--bg)", borderBottom: "1px solid var(--line)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>{clientName}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{sessionLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600 }}>{totalExercises} exercise{totalExercises !== 1 ? "s" : ""}</span>
            <button
              onClick={() => setEditMode((v) => !v)}
              style={{
                width: 32, height: 32, borderRadius: 8, cursor: "pointer",
                border: editMode ? "none" : "1px solid var(--line)",
                background: editMode ? "var(--accent)" : "var(--panel)",
                color: editMode ? "#fff" : "var(--dim)",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              ✎
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 16px 120px", maxWidth: 480, margin: "0 auto" }}>
          <div ref={listRef}>
            {blocks.map((block, i) => (
              <div
                key={blockKeyOf(block)}
                ref={(el) => { blockRefs.current[i] = el; }}
                style={{
                  position: "relative",
                  paddingLeft: editMode ? 24 : 0,
                  outline: blockOverIdx === i && blockDragIdx !== null && blockDragIdx !== i ? "2px solid var(--good)" : "none",
                  outlineOffset: 3,
                  borderRadius: 16,
                  opacity: blockDragIdx === i ? 0.5 : 1,
                }}
              >
                {editMode && (
                  <button
                    onPointerDown={(e) => onBlockHandleDown(e, i)}
                    onPointerMove={(e) => onBlockHandleMove(e, e.currentTarget)}
                    onPointerUp={onBlockHandleUp}
                    onPointerCancel={onBlockHandleUp}
                    style={{
                      position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)",
                      width: 24, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--dim)", fontSize: 15, cursor: "grab", touchAction: "none",
                      background: "transparent", border: "none", zIndex: 6,
                    }}
                  >
                    ⋮⋮
                  </button>
                )}
                <BlockWrapper
                  block={block}
                  sessionId={session.id}
                  clientId={clientId}
                  defaultUnit={defaultUnit}
                  editMode={editMode}
                  onDeleteExercise={handleDeleteExercise}
                  onReorderGroup={(newExs) => handleReorderGroup(i, newExs)}
                />
              </div>
            ))}
          </div>
        </div>

        <ExerciseDrawer
          allExercises={allExercises}
          resolveDropTarget={resolveDropTarget}
          onDrop={handleDrawerDrop}
        />

        <CoachBottomMenu links={[{ href: `/coach/clients/${clientId}/builder`, label: "← Builder" }]} />
      </div>
    </>
  );
}
