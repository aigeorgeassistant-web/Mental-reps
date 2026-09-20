"use client";
// components/coach/CoachLiveSession.tsx
// Coach live-logging view — styled like TodayWorkout but with:
//   • + Set per exercise (extra set beyond prescribed)
//   • + Exercise (search → add ad-hoc exercise, logs directly, no SessionExercise written)
// All logging goes to /api/coach/live/log-set (coach-role route).
// DrumPicker and value generators are copied verbatim from TodayWorkout.tsx for parity.

import { useState, useRef, useEffect, useMemo } from "react";
import type { Exercise, SessionExercise } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Units = "KG" | "LB";

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
    if (!sessionExerciseId) return;
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

  const doneSets = sets.filter((s) => s.done).length;

  return (
    <div style={{ background: "var(--panel)", borderRadius: 14, padding: "14px 14px 10px", marginBottom: 12, border: "1px solid var(--line)" }}>
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
          <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600 }}>{totalExercises} exercise{totalExercises !== 1 ? "s" : ""}</div>
        </div>

        <div style={{ padding: "16px 16px 120px", maxWidth: 480, margin: "0 auto" }}>
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

          <button
            onClick={() => setShowAddExercise(true)}
            style={{ width: "100%", height: 52, borderRadius: 14, border: "1.5px dashed var(--line)", background: "none", color: "var(--dim)", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: ".03em", marginTop: 4 }}
          >
            + Exercise
          </button>
        </div>

        {showAddExercise && (
          <AddExerciseOverlay
            allExercises={allExercises}
            onAdd={handleAddExercise}
            onClose={() => setShowAddExercise(false)}
          />
        )}
      </div>
    </>
  );
}
