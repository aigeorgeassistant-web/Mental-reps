"use client";
// components/coach/GoalEditor.tsx
// Opened from an exercise row's ⋮ menu in the builder. Detects the chain
// (every occurrence of this exercise across the chosen day label(s), in
// order), lets the coach define a Strength progression cycle against it,
// and saves it as one ExerciseGoal linked to every row in the chain.

import { useEffect, useState } from "react";
import {
  detectGoalChain,
  getExerciseGoal,
  saveExerciseGoal,
  removeExerciseGoal,
} from "@/lib/actions/goal-actions";

type WorkingBlock = { type: "working"; target: "reps" | "weight"; min?: number; max?: number; fixedWeight?: number };
type DeloadBlock = { type: "deload"; min: number; max: number; intensity: number };
type RetestBlock = { type: "retest" };
type Block = WorkingBlock | DeloadBlock | RetestBlock;
// Loosened for editing: local UI state just shuttles plain values into a
// JSON blob on save, so a flat, permissive shape avoids fighting a
// discriminated union while a block's type is still being switched.
type EditableBlock = { type: Block["type"]; target?: "reps" | "weight"; min?: number; max?: number; fixedWeight?: number; intensity?: number; sets?: number };

function defaultBlock(): EditableBlock {
  return { type: "working", target: "reps", min: 5, max: 7, sets: 3 };
}

export function GoalEditor({
  sessionExerciseId,
  exerciseName,
  currentDayLabel,
  onClose,
  onSaved,
}: {
  sessionExerciseId: string;
  exerciseName: string;
  currentDayLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [existingGoalId, setExistingGoalId] = useState<string | undefined>(undefined);
  const [chainAnchorId, setChainAnchorId] = useState(sessionExerciseId);
  const [dayLabels, setDayLabels] = useState<string[]>([currentDayLabel]);
  const [otherDayLabels, setOtherDayLabels] = useState<string[]>([]);
  const [occurrenceCount, setOccurrenceCount] = useState(0);
  const [blocks, setBlocks] = useState<EditableBlock[]>([defaultBlock()]);
  const [baselineAnchor, setBaselineAnchor] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await getExerciseGoal(sessionExerciseId);
      if (existing) {
        setExistingGoalId(existing.id);
        setDayLabels(existing.dayLabels);
        setBlocks(existing.blocks as unknown as EditableBlock[]);
        setBaselineAnchor(existing.baselineAnchor ?? 0);
        if (existing.sessionExercises[0]) setChainAnchorId(existing.sessionExercises[0].id);
      }
      setLoading(false);
    })();
  }, [sessionExerciseId]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const chain = await detectGoalChain(chainAnchorId, dayLabels);
      if (!chain) return;
      setOccurrenceCount(chain.chainSessionExerciseIds.length);
      setOtherDayLabels(chain.otherDayLabelsFound);
    })();
  }, [dayLabels, loading, chainAnchorId]);

  function toggleDayLabel(label: string) {
    setDayLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  }

  function updateBlock(i: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function setBlockType(i: number, type: Block["type"]) {
    setBlocks((prev) =>
      prev.map((b, idx): EditableBlock => {
        if (idx !== i) return b;
        if (type === "working") return { type: "working", target: "reps", min: 5, max: 7, sets: 3 };
        if (type === "deload") return { type: "deload", min: 8, max: 10, intensity: 60, sets: 2 };
        return { type: "retest" };
      })
    );
  }
  function addBlock() { setBlocks((prev) => [...prev, defaultBlock()]); }
  function removeBlock(i: number) { setBlocks((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    setSaving(true);
    await saveExerciseGoal({ sessionExerciseId, dayLabels, blocks, baselineAnchor, existingGoalId });
    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleRemove() {
    if (!existingGoalId) return;
    setSaving(true);
    await removeExerciseGoal(existingGoalId);
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold">🎯 Goal — {exerciseName}</span>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">✕</button>
        </div>

        {loading ? (
          <div className="text-xs text-neutral-500 py-6 text-center">Loading…</div>
        ) : (
          <>
            <div className="mb-3">
              <div className="text-xs font-semibold text-neutral-600 mb-1">Days included in this chain</div>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {dayLabels.map((l) => (
                  <span key={l} className="text-xs bg-neutral-800 text-white px-2 py-1 rounded flex items-center gap-1">
                    {l}
                    {dayLabels.length > 1 && (
                      <button onClick={() => toggleDayLabel(l)} className="text-neutral-300 hover:text-white">✕</button>
                    )}
                  </span>
                ))}
              </div>
              <div className="text-xs text-neutral-500">{occurrenceCount} occurrence{occurrenceCount !== 1 ? "s" : ""} found in this program.</div>
              {otherDayLabels.length > 0 && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="text-amber-800 mb-1">This exercise also appears on: {otherDayLabels.join(", ")}</div>
                  {otherDayLabels.map((l) => (
                    <button
                      key={l}
                      onClick={() => toggleDayLabel(l)}
                      className="text-xs bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded mr-1 hover:bg-amber-100"
                    >
                      + Include {l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="text-xs font-semibold text-neutral-600 block mb-1">Starting point (e1RM estimate, kg)</label>
              <input
                type="number"
                value={baselineAnchor}
                onChange={(e) => setBaselineAnchor(Number(e.target.value))}
                className="w-24 border rounded px-2 py-1 text-sm"
              />
            </div>

            <div className="mb-3">
              <div className="text-xs font-semibold text-neutral-600 mb-1.5">Cycle (repeats if the chain runs longer)</div>
              {blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5 bg-neutral-50 border rounded p-1.5">
                  <span className="text-xs text-neutral-400 w-5 flex-shrink-0">{i + 1}</span>
                  <select
                    value={b.type}
                    onChange={(e) => setBlockType(i, e.target.value as Block["type"])}
                    className="text-xs border rounded px-1 py-1"
                  >
                    <option value="working">Working</option>
                    <option value="deload">Deload</option>
                    <option value="retest">Retest</option>
                  </select>

                  {(b.type === "working" || b.type === "deload") && (
                    <>
                      <input type="number" value={b.sets ?? 3} onChange={(e) => updateBlock(i, { sets: Number(e.target.value) })} className="w-10 border rounded px-1 py-1 text-xs" title="Number of sets" />
                      <span className="text-xs text-neutral-400">sets</span>
                    </>
                  )}

                  {b.type === "working" && (
                    <>
                      <div className="flex border rounded overflow-hidden flex-shrink-0">
                        <button
                          onClick={() => updateBlock(i, { target: "reps", min: 5, max: 7 } as any)}
                          className={`text-xs px-2 py-1 ${b.target === "reps" ? "bg-neutral-700 text-white" : "bg-white text-neutral-500"}`}
                        >
                          Reps
                        </button>
                        <button
                          onClick={() => updateBlock(i, { target: "weight", fixedWeight: 70 } as any)}
                          className={`text-xs px-2 py-1 ${b.target === "weight" ? "bg-neutral-700 text-white" : "bg-white text-neutral-500"}`}
                        >
                          Weight
                        </button>
                      </div>
                      {b.target === "reps" ? (
                        <>
                          <input type="number" value={b.min ?? 5} onChange={(e) => updateBlock(i, { min: Number(e.target.value) })} className="w-12 border rounded px-1 py-1 text-xs" />
                          <span className="text-xs text-neutral-400">–</span>
                          <input type="number" value={b.max ?? 7} onChange={(e) => updateBlock(i, { max: Number(e.target.value) })} className="w-12 border rounded px-1 py-1 text-xs" />
                          <span className="text-xs text-neutral-400">reps</span>
                        </>
                      ) : (
                        <>
                          <input type="number" value={b.fixedWeight ?? 70} onChange={(e) => updateBlock(i, { fixedWeight: Number(e.target.value) })} className="w-14 border rounded px-1 py-1 text-xs" />
                          <span className="text-xs text-neutral-400">kg, reps open</span>
                        </>
                      )}
                    </>
                  )}

                  {b.type === "deload" && (
                    <>
                      <input type="number" value={b.min} onChange={(e) => updateBlock(i, { min: Number(e.target.value) })} className="w-12 border rounded px-1 py-1 text-xs" />
                      <span className="text-xs text-neutral-400">–</span>
                      <input type="number" value={b.max} onChange={(e) => updateBlock(i, { max: Number(e.target.value) })} className="w-12 border rounded px-1 py-1 text-xs" />
                      <span className="text-xs text-neutral-400">@</span>
                      <input type="number" value={b.intensity} onChange={(e) => updateBlock(i, { intensity: Number(e.target.value) })} className="w-12 border rounded px-1 py-1 text-xs" />
                      <span className="text-xs text-neutral-400">%</span>
                    </>
                  )}

                  {b.type === "retest" && <span className="text-xs text-neutral-500 flex-1">Single effort — sets new baseline</span>}

                  <button onClick={() => removeBlock(i)} className="text-neutral-400 hover:text-red-600 ml-auto flex-shrink-0">✕</button>
                </div>
              ))}
              <button onClick={addBlock} className="w-full text-xs border border-dashed rounded py-1.5 text-neutral-500 hover:bg-neutral-50">
                + Add block
              </button>
            </div>

            <div className="flex gap-2 mt-4">
              {existingGoalId && (
                <button onClick={handleRemove} disabled={saving} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50">
                  Remove goal
                </button>
              )}
              <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border ml-auto">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 rounded bg-neutral-800 text-white">
                {saving ? "Saving…" : "Save goal"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
