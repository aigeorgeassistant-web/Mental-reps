"use client";
// components/coach/PasteImportModal.tsx
// Paste from Google Sheets: one textarea, tab-separated rows.
// Parses name / sets×reps / weight. Fuzzy matches exercises.
// Inline create form for unrecognized exercises.

import { useState, useCallback } from "react";
import type { Exercise } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  raw: string;
  name: string;
  sets: number | null;
  reps: number | null;
  loadValue: number | null;
  loadUnit: "KG" | "LB";
};

type ResolvedRow = ParsedRow & { exerciseId: string };

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
  const m = clean.match(/(\d+(?:\.\d+)?)/);
  if (!m) return { loadValue: null, loadUnit: "KG" };
  const val = parseFloat(m[1]);
  const unit: "KG" | "LB" = /lb/i.test(clean) ? "LB" : "KG";
  return { loadValue: val, loadUnit: unit };
}

function parseText(text: string): ParsedRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Split on tabs (Sheets) or 2+ spaces or comma as fallback
      const cols = line.includes("\t")
        ? line.split("\t")
        : line.split(/\s{2,}|,/);
      const name = (cols[0] ?? "").trim();
      const { sets, reps } = parseSetsReps((cols[1] ?? "").trim());
      const { loadValue, loadUnit } = parseWeight((cols[2] ?? "").trim());
      return { raw: line, name, sets, reps, loadValue, loadUnit };
    })
    .filter((r) => r.name.length > 0);
}

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

type MatchResult =
  | { kind: "exact"; exercise: Exercise }
  | { kind: "fuzzy"; candidates: Exercise[] };

function fuzzyMatch(query: string, exercises: Exercise[]): MatchResult {
  const q = normalize(query);
  const exact = exercises.find((e) => normalize(e.name) === q);
  if (exact) return { kind: "exact", exercise: exact };
  const scored = exercises.map((e) => {
    const n = normalize(e.name);
    let score = levenshtein(q, n);
    if (n.includes(q) || q.includes(n)) score -= 8;
    if (n.startsWith(q) || q.startsWith(n)) score -= 4;
    return { e, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return { kind: "fuzzy", candidates: scored.slice(0, 5).map((s) => s.e) };
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
  type Phase = "paste" | "preview" | "resolving";
  const [phase, setPhase] = useState<Phase>("paste");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);

  // Resolving state
  const [queue, setQueue] = useState<ParsedRow[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [flyoutCandidates, setFlyoutCandidates] = useState<Exercise[]>([]);
  const [currentRow, setCurrentRow] = useState<ParsedRow | null>(null);

  // Inline create
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMuscles, setCreateMuscles] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const [importing, setImporting] = useState(false);

  // ─── Phase: paste → preview ────────────────────────────────────────────────

  function handleProceed() {
    const rows = parseText(text);
    if (rows.length === 0) return;
    setParsed(rows);
    setPhase("preview");
  }

  // ─── Phase: preview → resolving ───────────────────────────────────────────

  function startResolving() {
    setQueue(parsed);
    setQueueIdx(0);
    setResolved([]);
    setPhase("resolving");
    processRow(parsed, 0, []);
  }

  const processRow = useCallback((q: ParsedRow[], idx: number, acc: ResolvedRow[]) => {
    if (idx >= q.length) {
      doImport(acc);
      return;
    }
    const row = q[idx];
    const match = fuzzyMatch(row.name, exercises);
    if (match.kind === "exact") {
      processRow(q, idx + 1, [...acc, { ...row, exerciseId: match.exercise.id }]);
    } else {
      setCurrentRow(row);
      setQueueIdx(idx);
      setResolved(acc);
      setFlyoutCandidates(match.candidates);
      setCreating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);

  function pickCandidate(ex: Exercise) {
    if (!currentRow) return;
    processRow(queue, queueIdx + 1, [...resolved, { ...currentRow, exerciseId: ex.id }]);
  }

  function skipRow() {
    processRow(queue, queueIdx + 1, resolved);
  }

  // ─── Inline create ─────────────────────────────────────────────────────────

  function openCreate() {
    if (!currentRow) return;
    setCreateName(currentRow.name);
    setCreateMuscles("");
    setCreateError(null);
    setCreating(true);
  }

  async function saveNewExercise() {
    if (!createName.trim() || !currentRow) return;
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
        setCreateError(d.error ?? "Failed");
        setCreateSaving(false);
        return;
      }
      const { exercise } = await res.json();
      setCreating(false);
      setCreateSaving(false);
      processRow(queue, queueIdx + 1, [...resolved, { ...currentRow, exerciseId: exercise.id }]);
    } catch {
      setCreateError("Network error");
      setCreateSaving(false);
    }
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  async function doImport(rows: ResolvedRow[]) {
    if (rows.length === 0) { onImported(); onClose(); return; }
    setImporting(true);
    let order = currentRowCount;
    for (const row of rows) {
      await fetch(`/api/coach/sessions/${sessionId}/add-exercise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId: row.exerciseId,
          order: order++,
          sets: row.sets,
          reps: row.reps,
          loadValue: row.loadValue,
          loadUnit: row.loadUnit,
        }),
      });
    }
    setImporting(false);
    onImported();
    onClose();
  }

  // ─── Shared styles ─────────────────────────────────────────────────────────

  const btn = (primary?: boolean): React.CSSProperties => ({
    fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer",
    fontFamily: "inherit", border: primary ? "none" : "1px solid #e5e7eb",
    background: primary ? "#1a1a1a" : "#fff", color: primary ? "#fff" : "#555",
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div onClick={phase === "paste" ? onClose : undefined}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.35)" }} />

      <div style={{
        position: "fixed", zIndex: 51,
        left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,.18)",
        width: 520, maxWidth: "95vw", fontFamily: "inherit",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {phase === "paste" && "📋 Paste from spreadsheet"}
            {phase === "preview" && `📋 Preview — ${parsed.length} exercises`}
            {phase === "resolving" && `📋 Matching — ${queueIdx + 1} of ${queue.length}`}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer" }}>✕</button>
        </div>

        {/* ── PASTE phase ── */}
        {phase === "paste" && (
          <div style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
              Select rows in Google Sheets → Copy → Paste here. Columns: <strong>exercise name, sets×reps, weight</strong>.
            </p>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                // Let the paste happen, then auto-proceed
                setTimeout(() => {
                  const val = e.currentTarget.value || (e.clipboardData?.getData("text") ?? "");
                  if (val.trim()) setText(val);
                }, 0);
              }}
              placeholder={"Incline Press\t3×10\t80kg\nLateral Raise\t3×15\t10kg"}
              rows={10}
              style={{
                width: "100%", fontSize: 12, fontFamily: "monospace",
                padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                resize: "vertical", outline: "none", color: "#1a1a1a",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={onClose} style={btn()}>Cancel</button>
              <button onClick={handleProceed} disabled={!text.trim()} style={{ ...btn(true), opacity: !text.trim() ? 0.4 : 1 }}>
                Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW phase ── */}
        {phase === "preview" && (
          <div style={{ padding: 18 }}>
            <p style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
              Review what was parsed. Click "Add to session" to match and import.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: "4px 8px", marginBottom: 4 }}>
              {["Exercise", "Sets×reps", "Weight"].map((h) => (
                <div key={h} style={{ fontSize: 10, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</div>
              ))}
            </div>
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
              {parsed.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: "4px 8px", background: "#f9fafb", borderRadius: 6, padding: "6px 10px", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a" }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: r.sets || r.reps ? "#1a1a1a" : "#d1d5db", fontFamily: "monospace" }}>
                    {r.sets && r.reps ? `${r.sets}×${r.reps}` : r.reps ? `${r.reps}` : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: r.loadValue ? "#1a1a1a" : "#d1d5db", fontFamily: "monospace" }}>
                    {r.loadValue ? `${r.loadValue}${r.loadUnit === "LB" ? "lb" : "kg"}` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button onClick={() => setPhase("paste")} style={btn()}>← Back</button>
              <button onClick={startResolving} style={btn(true)}>Add to session →</button>
            </div>
          </div>
        )}

        {/* ── RESOLVING phase ── */}
        {phase === "resolving" && currentRow && (
          <div style={{ padding: 18 }}>
            {/* Progress bar */}
            <div style={{ height: 3, background: "#f0f0f0", borderRadius: 2, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#1a1a1a", borderRadius: 2, width: `${((queueIdx) / queue.length) * 100}%`, transition: "width .3s" }} />
            </div>

            {/* Current row */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 3 }}>"{currentRow.name}"</div>
              <div style={{ fontSize: 11, color: "#888" }}>
                {currentRow.sets && currentRow.reps ? `${currentRow.sets}×${currentRow.reps}` : currentRow.reps ? `${currentRow.reps} reps` : "no sets/reps"}
                {currentRow.loadValue ? ` · ${currentRow.loadValue}${currentRow.loadUnit === "LB" ? "lb" : "kg"}` : ""}
              </div>
            </div>

            {!creating && (
              <>
                <p style={{ fontSize: 11, color: "#555", fontWeight: 500, marginBottom: 8 }}>Did you mean one of these?</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {flyoutCandidates.map((ex) => (
                    <button key={ex.id} onClick={() => pickCandidate(ex)} style={{
                      textAlign: "left", fontSize: 13, padding: "8px 12px",
                      borderRadius: 8, border: "1px solid #e5e7eb",
                      background: "#fff", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span>{ex.name}</span>
                      <span style={{ fontSize: 10, color: "#aaa" }}>{ex.muscleGroups?.slice(0, 2).join(", ")}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                  <button onClick={skipRow} style={btn()}>Skip</button>
                  <button onClick={openCreate} style={{ ...btn(true), flex: 1 }}>+ Create new exercise</button>
                </div>
              </>
            )}

            {/* Inline create form */}
            {creating && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Create new exercise</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>Name *</label>
                    <input value={createName} onChange={(e) => setCreateName(e.target.value)}
                      style={{ width: "100%", fontSize: 13, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>Muscle groups (comma-separated)</label>
                    <input value={createMuscles} onChange={(e) => setCreateMuscles(e.target.value)}
                      placeholder="e.g. Chest, Triceps"
                      style={{ width: "100%", fontSize: 13, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  {createError && <p style={{ fontSize: 11, color: "#ef4444" }}>{createError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setCreating(false)} style={btn()}>Cancel</button>
                    <button onClick={saveNewExercise} disabled={createSaving || !createName.trim()}
                      style={{ ...btn(true), flex: 1, opacity: createSaving || !createName.trim() ? 0.5 : 1 }}>
                      {createSaving ? "Saving…" : "Save & continue"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {importing && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, fontSize: 13, color: "#555" }}>
            Adding exercises…
          </div>
        )}
      </div>
    </>
  );
}
