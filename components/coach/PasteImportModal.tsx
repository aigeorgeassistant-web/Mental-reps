"use client";
// components/coach/PasteImportModal.tsx
// Sheet-paste import: 8 rows × 3 cols (name / sets×reps / weight)
// Color dot groups adjacent same-color rows as supersets.
// Fuzzy matches against existing exercises, flyout for ambiguous rows,
// "Add new exercise" pre-fills the name and calls onAddNew.

import { useState, useRef, useCallback } from "react";
import type { Exercise } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type GridRow = {
  name: string;
  setsReps: string;
  weight: string;
  color: string | null; // null = no group
};

type ParsedRow = {
  name: string;
  sets: number | null;
  reps: number | null;
  loadValue: number | null;
  loadUnit: "KG" | "LB";
  color: string | null;
};

type MatchResult =
  | { kind: "exact"; exercise: Exercise }
  | { kind: "fuzzy"; candidates: Exercise[] }
  | { kind: "empty" };

type ResolvedRow = ParsedRow & { exerciseId: string };

const PALETTE = ["#FCA5A5", "#FDBA74", "#FDE68A", "#86EFAC", "#93C5FD", "#C4B5FD"];
const NO_COLOR = "none";

// ─── Fuzzy match ──────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function fuzzyMatch(query: string, exercises: Exercise[]): MatchResult {
  const q = normalize(query);
  if (!q) return { kind: "empty" };

  // Exact name match (case-insensitive)
  const exact = exercises.find((e) => normalize(e.name) === q);
  if (exact) return { kind: "exact", exercise: exact };

  // Score by: contains > starts-with > levenshtein
  const scored = exercises.map((e) => {
    const n = normalize(e.name);
    let score = levenshtein(q, n);
    if (n.includes(q) || q.includes(n)) score -= 8;
    if (n.startsWith(q) || q.startsWith(n)) score -= 4;
    return { e, score };
  });
  scored.sort((a, b) => a.score - b.score);

  const top = scored.slice(0, 5).filter((s) => s.score < q.length * 0.8);
  if (top.length === 0) return { kind: "fuzzy", candidates: scored.slice(0, 5).map((s) => s.e) };
  return { kind: "fuzzy", candidates: top.map((s) => s.e) };
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseSetsReps(raw: string): { sets: number | null; reps: number | null } {
  const m = raw.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (m) return { sets: Number(m[1]), reps: Number(m[2]) };
  const single = raw.trim().match(/^(\d+)$/);
  if (single) return { sets: null, reps: Number(single[1]) };
  return { sets: null, reps: null };
}

function parseWeight(raw: string): { loadValue: number | null; loadUnit: "KG" | "LB" } {
  const clean = raw.trim();
  // Extract first number found
  const m = clean.match(/(\d+(?:\.\d+)?)/);
  if (!m) return { loadValue: null, loadUnit: "KG" };
  const val = parseFloat(m[1]);
  const unit: "KG" | "LB" = /lb/i.test(clean) ? "LB" : "KG";
  return { loadValue: val, loadUnit: unit };
}

function parseGridRow(row: GridRow): ParsedRow {
  const { sets, reps } = parseSetsReps(row.setsReps);
  const { loadValue, loadUnit } = parseWeight(row.weight);
  return { name: row.name.trim(), sets, reps, loadValue, loadUnit, color: row.color };
}

// ─── Color dot picker ─────────────────────────────────────────────────────────

function ColorDot({ color, onChange }: { color: string | null; onChange: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Set group color"
        style={{
          width: 18, height: 18, borderRadius: "50%",
          background: color ?? "#e5e7eb",
          border: "1.5px solid #d1d5db",
          cursor: "pointer", flexShrink: 0,
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute", left: 0, top: 22, zIndex: 100,
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 8, padding: 6, display: "flex", gap: 4, flexWrap: "wrap", width: 92,
            boxShadow: "0 4px 12px rgba(0,0,0,.12)",
          }}
        >
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{ width: 18, height: 18, borderRadius: "50%", background: "#e5e7eb", border: "1.5px solid #d1d5db", cursor: "pointer" }}
            title="No group"
          />
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: color === c ? "2px solid #374151" : "1.5px solid transparent", cursor: "pointer" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function PasteImportModal({
  exercises,
  sessionId,
  currentRowCount,
  onClose,
  onImported,
}: {
  exercises: Exercise[];
  sessionId: string;
  currentRowCount: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const emptyGrid = (): GridRow[] =>
    Array.from({ length: 8 }, () => ({ name: "", setsReps: "", weight: "", color: null }));

  const [grid, setGrid] = useState<GridRow[]>(emptyGrid());

  // Processing state
  type Phase = "grid" | "resolving" | "done";
  const [phase, setPhase] = useState<Phase>("grid");
  const [queue, setQueue] = useState<ParsedRow[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [flyoutCandidates, setFlyoutCandidates] = useState<Exercise[]>([]);
  const [currentRow, setCurrentRow] = useState<ParsedRow | null>(null);

  // Tab navigation between cells
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setCell(rowIdx: number, field: keyof GridRow, value: string) {
    setGrid((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [field]: value };
      return next;
    });
  }

  function setRowColor(rowIdx: number, color: string | null) {
    setGrid((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], color };
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) {
    if (e.key === "Tab") {
      e.preventDefault();
      const next = rowIdx * 3 + colIdx + 1;
      if (next < 8 * 3) inputRefs.current[next]?.focus();
    }
  }

  // ─── Start processing ──────────────────────────────────────────────────────

  function startImport() {
    const parsed = grid
      .map(parseGridRow)
      .filter((r) => r.name.length > 0);
    if (parsed.length === 0) return;
    setQueue(parsed);
    setQueueIdx(0);
    setResolved([]);
    setPhase("resolving");
    processRow(parsed, 0, []);
  }

  const processRow = useCallback((q: ParsedRow[], idx: number, acc: ResolvedRow[]) => {
    if (idx >= q.length) {
      // All resolved — import
      doImport(acc);
      return;
    }
    const row = q[idx];
    const match = fuzzyMatch(row.name, exercises);
    if (match.kind === "exact") {
      const next: ResolvedRow = { ...row, exerciseId: match.exercise.id };
      processRow(q, idx + 1, [...acc, next]);
    } else {
      // Fuzzy — show flyout
      setCurrentRow(row);
      setQueueIdx(idx);
      setResolved(acc);
      setFlyoutCandidates(match.kind === "fuzzy" ? match.candidates : []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);

  function pickCandidate(ex: Exercise) {
    if (!currentRow) return;
    const next: ResolvedRow = { ...currentRow, exerciseId: ex.id };
    const newAcc = [...resolved, next];
    processRow(queue, queueIdx + 1, newAcc);
  }

  function skipRow() {
    processRow(queue, queueIdx + 1, resolved);
  }

  // ─── Inline create exercise ────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMuscles, setCreateMuscles] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  function handleAddNew() {
    if (!currentRow) return;
    setCreateName(currentRow.name);
    setCreateError(null);
    setCreating(true);
  }

  async function saveNewExercise() {
    if (!createName.trim()) return;
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          muscleGroups: createMuscles.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setCreateError(d.error ?? "Failed to create");
        setCreateSaving(false);
        return;
      }
      const { exercise } = await res.json();
      setCreating(false);
      setCreateSaving(false);
      // Continue the queue with the new exercise
      if (!currentRow) return;
      const next: ResolvedRow = { ...currentRow, exerciseId: exercise.id };
      const newAcc = [...resolved, next];
      processRow(queue, queueIdx + 1, newAcc);
    } catch {
      setCreateError("Network error");
      setCreateSaving(false);
    }
  }

  // ─── Do the actual import ──────────────────────────────────────────────────

  async function doImport(rows: ResolvedRow[]) {
    if (rows.length === 0) { onImported(); onClose(); return; }

    // Group adjacent same-color rows
    type ImportGroup = { rows: ResolvedRow[]; color: string | null };
    const groups: ImportGroup[] = [];
    for (let i = 0; i < rows.length; ) {
      const r = rows[i];
      if (!r.color) {
        groups.push({ rows: [r], color: null });
        i++;
      } else {
        let j = i;
        while (j < rows.length && rows[j].color === r.color) j++;
        groups.push({ rows: rows.slice(i, j), color: r.color });
        i = j;
      }
    }

    let orderOffset = currentRowCount;

    for (const group of groups) {
      // Create a groupId if superset (multiple rows, same color)
      let groupId: string | null = null;
      let groupColor: string | null = null;
      if (group.rows.length > 1 && group.color) {
        // Call assignSupersetGroup via the existing API
        const ids = await Promise.all(
          group.rows.map(async (row, k) => {
            const res = await fetch(`/api/coach/sessions/${sessionId}/add-exercise`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exerciseId: row.exerciseId,
                order: orderOffset + k,
                sets: row.sets,
                reps: row.reps,
                loadValue: row.loadValue,
                loadUnit: row.loadUnit,
              }),
            });
            const d = await res.json();
            return d.id as string;
          })
        );
        orderOffset += group.rows.length;

        // Now group them as a superset
        await fetch(`/api/coach/sessions/${sessionId}/group`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionExerciseIds: ids, color: group.color }),
        });
      } else {
        // Single exercise or no color
        for (const row of group.rows) {
          await fetch(`/api/coach/sessions/${sessionId}/add-exercise`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exerciseId: row.exerciseId,
              order: orderOffset,
              sets: row.sets,
              reps: row.reps,
              loadValue: row.loadValue,
              loadUnit: row.loadUnit,
            }),
          });
          orderOffset++;
        }
      }
    }

    setPhase("done");
    onImported();
    onClose();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const cols = ["Exercise name", "Sets × reps", "Weight"];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={phase === "grid" ? onClose : undefined}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.35)" }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", zIndex: 51,
        left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,.18)",
        width: 540, maxWidth: "95vw", fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>📋 Paste exercises</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Grid */}
        {phase === "grid" && (
          <>
            <div style={{ padding: "12px 18px 0" }}>
              <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
                Fill up to 8 rows. Same color dot = superset group. Tab between cells.
              </p>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 110px 110px", gap: 6, marginBottom: 4, paddingLeft: 2 }}>
                <div />
                {cols.map((c) => (
                  <div key={c} style={{ fontSize: 10, color: "#aaa", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em" }}>{c}</div>
                ))}
              </div>

              {/* Rows */}
              {grid.map((row, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "20px 1fr 110px 110px", gap: 6, marginBottom: 4, alignItems: "center" }}>
                  <ColorDot color={row.color} onChange={(c) => setRowColor(ri, c)} />
                  {(["name", "setsReps", "weight"] as const).map((field, ci) => (
                    <input
                      key={field}
                      ref={(el) => { inputRefs.current[ri * 3 + ci] = el; }}
                      value={row[field]}
                      onChange={(e) => setCell(ri, field, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, ri, ci)}
                      placeholder={field === "name" ? `Exercise ${ri + 1}` : field === "setsReps" ? "3×10" : "80kg"}
                      style={{
                        fontSize: 12, padding: "5px 8px",
                        border: "1px solid #e5e7eb", borderRadius: 6,
                        outline: "none", fontFamily: "inherit", width: "100%",
                        background: row.name === "" && field === "name" ? "#fafafa" : "#fff",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px", borderTop: "1px solid #f0f0f0", marginTop: 8 }}>
              <button onClick={onClose} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={startImport}
                disabled={grid.every((r) => !r.name.trim())}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none", background: "#1a1a1a", color: "#fff", cursor: "pointer", opacity: grid.every((r) => !r.name.trim()) ? 0.4 : 1 }}
              >
                Add to session →
              </button>
            </div>
          </>
        )}

        {/* Resolving phase — show current row with flyout */}
        {phase === "resolving" && currentRow && (
          <div style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
              Matching exercise {queueIdx + 1} of {queue.length}
            </p>

            {/* Current row summary */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 3 }}>"{currentRow.name}"</div>
              <div style={{ fontSize: 11, color: "#888" }}>
                {currentRow.sets && currentRow.reps ? `${currentRow.sets} × ${currentRow.reps}` : currentRow.reps ? `${currentRow.reps} reps` : "no sets/reps"}{" "}
                {currentRow.loadValue ? `· ${currentRow.loadValue}${currentRow.loadUnit}` : ""}
              </div>
            </div>

            <p style={{ fontSize: 11, color: "#555", fontWeight: 500, marginBottom: 8 }}>Did you mean one of these?</p>

            {/* Candidates */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {flyoutCandidates.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => pickCandidate(ex)}
                  style={{
                    textAlign: "left", fontSize: 13, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid #e5e7eb",
                    background: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    fontFamily: "inherit",
                  }}
                >
                  <span>{ex.name}</span>
                  <span style={{ fontSize: 10, color: "#aaa" }}>{ex.muscleGroups?.slice(0, 2).join(", ")}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
              <button
                onClick={skipRow}
                style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", color: "#888" }}
              >
                Skip
              </button>
              <button
                onClick={handleAddNew}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none", background: "#1a1a1a", color: "#fff", cursor: "pointer", flex: 1 }}
              >
                + Create new exercise
              </button>
            </div>

            {/* Inline create form */}
            {creating && (
              <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Create new exercise</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>Name *</label>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      style={{ width: "100%", fontSize: 13, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>Muscle groups (comma-separated)</label>
                    <input
                      value={createMuscles}
                      onChange={(e) => setCreateMuscles(e.target.value)}
                      placeholder="e.g. Chest, Triceps"
                      style={{ width: "100%", fontSize: 13, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit" }}
                    />
                  </div>
                  {createError && <p style={{ fontSize: 11, color: "#ef4444" }}>{createError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setCreating(false)}
                      style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveNewExercise}
                      disabled={createSaving || !createName.trim()}
                      style={{ fontSize: 12, padding: "6px 14px", borderRadius: 6, border: "none", background: "#1a1a1a", color: "#fff", cursor: "pointer", flex: 1, opacity: createSaving || !createName.trim() ? 0.5 : 1 }}
                    >
                      {createSaving ? "Saving…" : "Save & continue"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
