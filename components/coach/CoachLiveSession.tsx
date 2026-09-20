"use client";
// components/coach/CoachLiveSession.tsx
// Coach live-logging view — styled like TodayWorkout but with:
//   • + Set per exercise (extra set beyond prescribed)
//   • + Exercise (search → add ad-hoc exercise, logs directly, no SessionExercise written)
// All logging goes to /api/coach/live/log-set (coach-role route).

import { useState, useRef, useEffect, useMemo } from "react";
import type { Exercise, SessionExercise } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Units = "KG" | "LBS";

type LiveExercise = SessionExercise & {
  exercise: Exercise;
  loggedSets: { setIndex: number; weight: number | null; reps: number | null }[];
};

// An ad-hoc exercise added by the coach on the fly (no SessionExercise row)
type AdHocExercise = {
  adHoc: true;
  id: string; // client-side uuid only
  exerciseId: string;
  exercise: Exercise;
  sets: number;
  reps: number | null;
  loadValue: number | null;
  loadUnit: Units | null;
};

type AnyExercise = LiveExercise | AdHocExercise;

type SetState = { weight: number; reps: number; done: boolean; isPr?: boolean };

// ─── DrumPicker ───────────────────────────────────────────────────────────────

const ITEM_H = 48;
const PAD = ITEM_H * 2;

function makeWeightValues(current: number): number[] {
  const vals = new Set<number>();
  for (let i = 0; i <= 300; i += 0.5) vals.add(i);
  vals.add(current);
  return Array.from(vals).sort((a, b) => a - b);
}

function makeRepValues(current: number): number[] {
  const vals: number[] = [];
  for (let i = 1; i <= 100; i++) vals.push(i);
  if (!vals.includes(current)) vals.push(current);
  return vals.sort((a, b) => a - b);
}

function DrumPicker({
  label,
  values,
  initial,
  onConfirm,
  onCancel,
}: {
  label: string;
  values: number[];
  initial: number;
  onConfirm: (v: number) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const listRef = useRef<HTMLDivElement>(null);
  const initIdx = values.indexOf(initial);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = Math.max(0, initIdx) * ITEM_H;
    }
  }, []);

  function onScroll() {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / ITEM_H);
    const v = values[Math.min(Math.max(idx, 0), values.length - 1)];
    if (v !== undefined) setSelected(v);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--panel)", borderRadius: "18px 18px 0 0", padding: "0 0 24px" }}>
        <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--dim)" }}>{label}</span>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ position: "relative", height: ITEM_H * 5, overflow: "hidden", margin: "12px 0" }}>
          <div
            ref={listRef}
            onScroll={onScroll}
            style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", paddingTop: PAD, paddingBottom: PAD, overscrollBehavior: "contain" }}
          >
            {values.map((v) => (
              <div key={v} onClick={() => setSelected(v)} style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "center", fontSize: v === selected ? 26 : 18, fontWeight: v === selected ? 900 : 400, color: v === selected ? "var(--text)" : "var(--dim)", fontFamily: "monospace", cursor: "pointer", transition: "all .15s" }}>
                {v % 1 === 0 ? v : v.toFixed(1)}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: PAD, background: "linear-gradient(to bottom, var(--panel), transparent)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: PAD, background: "linear-gradient(to top, var(--panel), transparent)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "50%", left: 16, right: 16, transform: "translateY(-50%)", height: ITEM_H, borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", pointerEvents: "none" }} />
        </div>
        <div style={{ padding: "0 16px", display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid var(--line)", background: "none", color: "var(--dim)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onConfirm(selected)} style={{ flex: 2, height: 48, borderRadius: 12, border: "none", background: "var(--good)", color: "#0c1a10", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({
  s, i, unit,
  onPicker,
  onUncheck,
  onCheck,
}: {
  s: SetState; i: number; unit: Units;
  onPicker: (field: "weight" | "reps") => void;
  onUncheck: () => void;
  onCheck: () => void;
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
    </div>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  ex, sessionId, clientId, defaultUnit,
}: {
  ex: AnyExercise;
  sessionId: string;
  clientId: string;
  defaultUnit: Units;
}) {
  const isAdHoc = "adHoc" in ex;
  const sessionExerciseId = isAdHoc ? undefined : ex.id;
  const exerciseId = ex.exerciseId;
  const prescribedSets = isAdHoc ? ex.sets : (ex.sets ?? 1);
  const prescribedReps = isAdHoc ? ex.reps : (ex.reps ?? null);
  const prescribedWeight = isAdHoc ? ex.loadValue : (ex.loadValue ?? null);
  const unit: Units = (isAdHoc ? ex.loadUnit : ex.loadUnit) ?? defaultUnit;
  const name = ex.exercise.name;

  // Pre-populate from already-logged sets (for non-adHoc exercises)
  const existingLogs = isAdHoc ? [] : ex.loggedSets;

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
          sessionExerciseId: sessionExerciseId ?? undefined,
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
    if (!sessionExerciseId) return; // ad-hoc extra sets: no upsert key to delete by, just unmark locally
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
    setPicker(null);
    setSets((prev) => {
      const next = prev.map((ss, i) => i === setIdx ? { ...ss, [field]: v } : ss);
      if (field === "reps") doLog(setIdx, next);
      return next;
    });
  }

  function addSet() {
    setSets((prev) => [...prev, { weight: prev[prev.length - 1]?.weight ?? prescribedWeight ?? 0, reps: prev[prev.length - 1]?.reps ?? prescribedReps ?? 0, done: false }]);
  }

  const doneSets = sets.filter((s) => s.done).length;

  return (
    <div style={{ background: "var(--panel)", borderRadius: 14, padding: "14px 14px 10px", marginBottom: 12, border: "1px solid var(--line)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{name}</div>
          {prescribedSets && prescribedReps && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
              {prescribedSets}×{prescribedReps}{prescribedWeight ? ` @ ${prescribedWeight}${unit.toLowerCase()}` : ""}
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: doneSets === sets.length && sets.length > 0 ? "var(--good)" : "var(--dim)" }}>
          {doneSets}/{sets.length}
        </span>
      </div>

      {/* Set rows */}
      {sets.map((s, i) => (
        <SetRow
          key={i}
          s={s}
          i={i}
          unit={unit}
          onPicker={(field) => setPicker({ setIdx: i, field })}
          onUncheck={() => doUnlog(i)}
          onCheck={() => {
            setSets((prev) => {
              const next = prev.map((ss, j) => j === i ? { ...ss } : ss);
              doLog(i, next);
              return next;
            });
          }}
        />
      ))}

      {/* + Set */}
      <button
        onClick={addSet}
        style={{ marginTop: 4, width: "100%", height: 34, borderRadius: 9, border: "1px dashed var(--line)", background: "none", color: "var(--dim)", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: ".03em" }}
      >
        + Set
      </button>

      {/* DrumPicker */}
      {picker && (
        <DrumPicker
          label={picker.field === "weight" ? `Weight (${unit.toLowerCase()})` : "Reps"}
          values={picker.field === "weight" ? makeWeightValues(sets[picker.setIdx].weight ?? prescribedWeight ?? 0) : makeRepValues(sets[picker.setIdx].reps ?? prescribedReps ?? 1)}
          initial={picker.field === "weight" ? (sets[picker.setIdx].weight ?? prescribedWeight ?? 0) : (sets[picker.setIdx].reps ?? prescribedReps ?? 1)}
          onConfirm={handlePickerConfirm}
          onCancel={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ─── Add exercise overlay ────────────────────────────────────────────────────

function AddExerciseOverlay({
  allExercises,
  onAdd,
  onClose,
}: {
  allExercises: Exercise[];
  onAdd: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allExercises.slice(0, 30);
    return allExercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 30);
  }, [query, allExercises]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "var(--panel)", borderRadius: "18px 18px 0 0", padding: "16px 16px 32px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Add exercise</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontSize: 15, padding: "0 14px", marginBottom: 10, boxSizing: "border-box", outline: "none" }}
        />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: 24 }}>No exercises found</div>
          )}
          {filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onAdd(ex)}
              style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, border: "none", background: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 2, display: "block" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {ex.name}
              {ex.muscleGroups.length > 0 && (
                <span style={{ display: "block", fontSize: 11, color: "var(--dim)", marginTop: 2, fontWeight: 400 }}>{ex.muscleGroups.slice(0, 3).join(", ")}</span>
              )}
            </button>
          ))}
        </div>
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
  const [adHocExercises, setAdHocExercises] = useState<AdHocExercise[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);

  function handleAddExercise(ex: Exercise) {
    setShowAddExercise(false);
    const newAdHoc: AdHocExercise = {
      adHoc: true,
      id: `adhoc-${Date.now()}-${ex.id}`,
      exerciseId: ex.id,
      exercise: ex,
      sets: 1,
      reps: null,
      loadValue: null,
      loadUnit: defaultUnit,
    };
    setAdHocExercises((prev) => [...prev, newAdHoc]);
  }

  const sessionLabel = session.dayLabel ?? (session.date ? new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Session");
  const totalExercises = session.sessionExercises.length + adHocExercises.length;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--bg)", borderBottom: "1px solid var(--line)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>{clientName}</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{sessionLabel}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600 }}>{totalExercises} exercise{totalExercises !== 1 ? "s" : ""}</div>
      </div>

      {/* Exercise cards */}
      <div style={{ padding: "16px 16px 120px" }}>
        {session.sessionExercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            sessionId={session.id}
            clientId={clientId}
            defaultUnit={defaultUnit}
          />
        ))}
        {adHocExercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            sessionId={session.id}
            clientId={clientId}
            defaultUnit={defaultUnit}
          />
        ))}

        {/* + Exercise button */}
        <button
          onClick={() => setShowAddExercise(true)}
          style={{ width: "100%", height: 52, borderRadius: 14, border: "1.5px dashed var(--line)", background: "none", color: "var(--dim)", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: ".03em", marginTop: 4 }}
        >
          + Exercise
        </button>
      </div>

      {/* Add exercise overlay */}
      {showAddExercise && (
        <AddExerciseOverlay
          allExercises={allExercises}
          onAdd={handleAddExercise}
          onClose={() => setShowAddExercise(false)}
        />
      )}
    </div>
  );
}
