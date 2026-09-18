"use client";
// components/client/ProgramsOverlay.tsx
// Shared Programs overlay — used in TodayWorkout and ClientDashboard

import { useEffect, useMemo, useState } from "react";

type TemplateSession = { id: string; weekNumber: number | null; dayLabel: string; order: number };

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  sessions: TemplateSession[];
  unlocked: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Single Session Date Picker ───────────────────────────────────────────────

function SingleSessionPopup({ templateId, session, onClose, onAdded }: {
  templateId: string;
  session: TemplateSession;
  onClose: () => void;
  onAdded: () => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  async function handleDayTap(day: number) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/client/templates/${templateId}/apply-single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateSessionId: session.id, dateKey }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) {
      setStatus(`✓ Added to ${MONTH_NAMES[month]} ${day}`);
      setTimeout(() => { onAdded(); onClose(); }, 1200);
    } else {
      setError(data.error ?? "Something went wrong.");
    }
  }

  // Build calendar grid
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayD = today.getDate();
  const todayM = today.getMonth();
  const todayY = today.getFullYear();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, width: 300, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>Pick a date</p>
            <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{session.dayLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "12px 16px" }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 18, cursor: "pointer", padding: "2px 8px" }}>‹</button>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{MONTH_NAMES[month]} {year}</p>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 18, cursor: "pointer", padding: "2px 8px" }}>›</button>
          </div>

          {/* Day labels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
            {DAY_LABELS.map(l => (
              <p key={l} style={{ textAlign: "center", fontSize: 9, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", padding: "2px 0" }}>{l}</p>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              const isToday = day !== null && day === todayD && month === todayM && year === todayY;
              const isPast = day !== null && new Date(year, month, day) < new Date(todayY, todayM, todayD);
              return (
                <button
                  key={i}
                  disabled={day === null || isPast || loading}
                  onClick={() => day && !isPast && handleDayTap(day)}
                  style={{
                    height: 34,
                    borderRadius: 6,
                    border: isToday ? "1px solid var(--steel)" : "none",
                    background: "transparent",
                    color: day === null ? "transparent" : isPast ? "var(--dim)" : "var(--text)",
                    fontSize: 12,
                    cursor: day === null || isPast ? "default" : "pointer",
                    opacity: isPast ? 0.35 : 1,
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {day ?? ""}
                </button>
              );
            })}
          </div>

          {error && <p style={{ fontSize: 11, color: "#f87171", marginTop: 10 }}>{error}</p>}
          {status && <p style={{ fontSize: 11, color: "#4ade80", marginTop: 10 }}>{status}</p>}
          {loading && <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 10 }}>Adding…</p>}

          <button onClick={onClose} style={{ width: "100%", marginTop: 12, padding: "9px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--dim)", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Apply Popup ──────────────────────────────────────────────────────────────

function ApplyPopup({ template, onClose, onApplied }: {
  template: TemplateRow;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [startDate, setStartDate] = useState(todayKey());
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(d: number) {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleApply() {
    if (weekdays.length === 0) { setError("Pick at least one training day."); return; }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/client/templates/${template.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDateKey: startDate, weekdays }),
    });
    const data = await res.json();
    if (data.sessionsCreated != null) {
      setStatus(`✓ ${data.sessionsCreated} sessions added to your calendar.`);
      setTimeout(() => { onApplied(); onClose(); }, 1500);
    } else {
      setError(data.error ?? "Something went wrong.");
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, width: 320, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>Add to calendar</p>
            <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{template.name} · {template.sessions.length} sessions</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>Start date</p>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)", fontSize: 13, padding: "7px 10px", width: "100%" }}
            />
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>Training days</p>
            <div style={{ display: "flex", gap: 6 }}>
              {DAY_LABELS.map((label, i) => (
                <button key={i} onClick={() => toggleDay(i)} style={{ flex: 1, padding: "7px 0", fontSize: 10, borderRadius: 6, cursor: "pointer", border: `1px solid ${weekdays.includes(i) ? "var(--steel)" : "var(--line)"}`, background: weekdays.includes(i) ? "var(--steel)" : "transparent", color: weekdays.includes(i) ? "#fff" : "var(--dim)", fontWeight: weekdays.includes(i) ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {weekdays.length > 0 && (
            <p style={{ fontSize: 11, color: "var(--dim)", background: "rgba(92,122,138,0.1)", borderRadius: 6, padding: "8px 10px" }}>
              {template.sessions.length} sessions across ~{Math.ceil(template.sessions.length / weekdays.length)} weeks
            </p>
          )}
          {error && <p style={{ fontSize: 11, color: "#f87171" }}>{error}</p>}
          {status && <p style={{ fontSize: 11, color: "#4ade80" }}>{status}</p>}
          <button onClick={handleApply} disabled={loading || weekdays.length === 0} style={{ padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--steel)", color: "#fff", fontSize: 13, fontWeight: 600, opacity: loading || weekdays.length === 0 ? 0.5 : 1 }}>
            {loading ? "Adding…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Programs Overlay ─────────────────────────────────────────────────────────

export function ProgramsOverlay({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null);
  const [singleTarget, setSingleTarget] = useState<{ template: TemplateRow; session: TemplateSession } | null>(null);

  useEffect(() => {
    fetch("/api/client/templates")
      .then((r) => r.json())
      .then((data) => { setTemplates(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const unlocked = useMemo(() => templates.filter((t) => t.unlocked), [templates]);
  const available = useMemo(() => templates.filter((t) => !t.unlocked), [templates]);

  return (
    <>
      {applyTarget && (
        <ApplyPopup
          template={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={() => { setApplyTarget(null); onApplied(); onClose(); }}
        />
      )}

      {singleTarget && (
        <SingleSessionPopup
          templateId={singleTarget.template.id}
          session={singleTarget.session}
          onClose={() => setSingleTarget(null)}
          onAdded={onApplied}
        />
      )}

      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 90, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 16 }}>Programs</p>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, padding: "16px 20px", maxWidth: 560, width: "100%", margin: "0 auto" }}>
          {loading && <p style={{ color: "var(--dim)", fontSize: 13 }}>Loading…</p>}

          {!loading && unlocked.length === 0 && available.length === 0 && (
            <p style={{ color: "var(--dim)", fontSize: 13 }}>No programs available yet.</p>
          )}

          {unlocked.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Your programs</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {unlocked.map((t) => {
                  const expanded = expandedId === t.id;
                  const weeks = [...new Set(t.sessions.map((s) => s.weekNumber ?? 1))].sort((a, b) => a - b);
                  return (
                    <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel)" }}>
                      <button onClick={() => setExpandedId(expanded ? null : t.id)} style={{ width: "100%", padding: "14px 16px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{t.name}</p>
                            <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{weeks.length} week{weeks.length !== 1 ? "s" : ""} · {t.sessions.length} session{t.sessions.length !== 1 ? "s" : ""}</p>
                          </div>
                          <span style={{ color: "var(--dim)", fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {expanded && (
                        <div style={{ borderTop: "1px solid var(--line)", padding: "12px 16px" }}>
                          {t.description && <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>{t.description}</p>}
                          {weeks.map((w) => {
                            const days = t.sessions.filter((s) => (s.weekNumber ?? 1) === w).sort((a, b) => a.order - b.order);
                            return (
                              <div key={w} style={{ marginBottom: 8 }}>
                                <p style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Week {w}</p>
                                {days.map((d) => (
                                  <button
                                    key={d.id}
                                    onClick={() => setSingleTarget({ template: t, session: d })}
                                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 6, textAlign: "left" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(92,122,138,0.08)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                  >
                                    <span style={{ fontSize: 12, color: "var(--text)" }}>· {d.dayLabel}</span>
                                    <span style={{ fontSize: 10, color: "var(--steel)", fontWeight: 600 }}>+ Add</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                          <button onClick={() => setApplyTarget(t)} style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--steel)", color: "#fff", fontSize: 13, fontWeight: 600 }}>
                            Add full program to calendar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {available.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Available</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {available.map((t) => {
                  const expanded = expandedId === t.id;
                  const weeks = [...new Set(t.sessions.map((s) => s.weekNumber ?? 1))].sort((a, b) => a - b);
                  const price = t.price ? `${t.currency ?? "KWD"} ${t.price}` : "";
                  return (
                    <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--panel)", opacity: 0.7 }}>
                      <button onClick={() => setExpandedId(expanded ? null : t.id)} style={{ width: "100%", padding: "14px 16px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{t.name}</p>
                            <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{weeks.length} week{weeks.length !== 1 ? "s" : ""} · {t.sessions.length} session{t.sessions.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--steel)" }}>{price}</p>
                            <span style={{ fontSize: 10, color: "var(--dim)" }}>{expanded ? "▲" : "▼"}</span>
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <div style={{ borderTop: "1px solid var(--line)", padding: "12px 16px" }}>
                          {t.description && <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>{t.description}</p>}
                          {weeks.map((w) => {
                            const days = t.sessions.filter((s) => (s.weekNumber ?? 1) === w).sort((a, b) => a.order - b.order);
                            return (
                              <div key={w} style={{ marginBottom: 8 }}>
                                <p style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Week {w}</p>
                                {days.map((d) => <p key={d.id} style={{ fontSize: 12, color: "var(--text)", paddingLeft: 8, paddingBottom: 3 }}>· {d.dayLabel}</p>)}
                              </div>
                            );
                          })}
                          <button disabled style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "1px solid var(--line)", cursor: "not-allowed", background: "transparent", color: "var(--dim)", fontSize: 13 }}>
                            Coming soon
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
