"use client";
// Shown when a move/copy lands on a day that already has a session.
// The coach MUST pick a new date for every existing session before the
// action can continue — no default, no swap shortcut.

import { useState } from "react";
import type { DayConflict, Relocation } from "@/lib/session-day";

export function DayConflictModal({
  mode,
  targetDateKey,
  occupied,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  mode: "move" | "copy";
  targetDateKey: string;
  occupied: DayConflict[];
  busy: boolean;
  error: string | null;
  onConfirm: (relocations: Relocation[]) => void;
  onCancel: () => void;
}) {
  const [dates, setDates] = useState<Record<string, string>>({});

  const values = occupied.map((o) => dates[o.id] ?? "");
  const allFilled = values.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
  const noneOnTarget = values.every((v) => v !== targetDateKey);
  const distinct = new Set(values).size === values.length;
  const valid = allFilled && noneOnTarget && distinct;

  let hint: string | null = null;
  if (!noneOnTarget) hint = "Pick a different day than the one you're dropping on.";
  else if (allFilled && !distinct) hint = "Each session needs its own day.";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
      <div style={{ background: "#fff", borderRadius: 10, width: 320, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>⚠ {targetDateKey} already has a session</p>
          <p style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
            Choose a new day for the existing {occupied.length > 1 ? "sessions" : "session"} first. Then the {mode} goes through.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 12, gap: 10 }}>
          {occupied.map((o) => (
            <label key={o.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Move “{o.dayLabel}” to:</span>
              <input
                type="date"
                required
                value={dates[o.id] ?? ""}
                onChange={(e) => setDates((prev) => ({ ...prev, [o.id]: e.target.value }))}
                style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
              />
            </label>
          ))}
          {(hint || error) && <p style={{ fontSize: 11, color: "#dc2626" }}>{error ?? hint}</p>}
          <button
            disabled={!valid || busy}
            onClick={() => onConfirm(occupied.map((o) => ({ sessionId: o.id, dateKey: dates[o.id] })))}
            style={{ padding: "9px", borderRadius: 8, border: "none", cursor: valid && !busy ? "pointer" : "not-allowed", background: valid && !busy ? "#1a1a1a" : "#9ca3af", color: "#fff", fontSize: 13, fontWeight: 600 }}
          >
            {busy ? "Working…" : mode === "move" ? "Move session" : "Copy session"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "#888", fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
