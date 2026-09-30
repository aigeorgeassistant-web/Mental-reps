"use client";
// Shown above a month calendar while the coach must choose a new day for a
// session that is being displaced by a move/copy. The calendar itself is the
// picker — clicking an empty day completes the step.

export function DayPickBanner({
  mode,
  targetDateKey,
  label,
  step,
  total,
  error,
  busy,
  onCancel,
}: {
  mode: "move" | "copy";
  targetDateKey: string;
  label: string;
  step: number;
  total: number;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>
        ⚠ {targetDateKey} already has a session
      </p>
      <p style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
        {busy
          ? "Working…"
          : `Click a day below to move “${label}” there${total > 1 ? ` (${step}/${total})` : ""}. Then the ${mode} goes through.`}
      </p>
      {error && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{error}</p>}
      <button
        onClick={onCancel}
        disabled={busy}
        style={{ marginTop: 4, fontSize: 11, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        Cancel {mode}
      </button>
    </div>
  );
}
