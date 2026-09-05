"use client";
// components/client/ClientDashboard.tsx
// Three-panel client dashboard:
// Left:   month calendar (read-only) + week toggle
// Middle: read-only session preview
// Right:  History tab (exercise progress graphs) | Templates tab

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseRow = {
  id: string;
  name: string;
  gifUrl: string | null;
  lowerIsBetter: boolean;
};

type SessionExerciseRow = {
  id: string;
  exerciseId: string;
  exercise: ExerciseRow;
  order: number;
  sets: number | null;
  reps: number | null;
  loadValue: number | null;
  loadUnit: string | null;
  coachNote: string | null;
  target: string | null;
  groupId: string | null;
  groupColor: string | null;
  setType: string;
};

type SessionRow = {
  id: string;
  date: string | null;
  dayLabel: string;
  sessionExercises: SessionExerciseRow[];
};

type LoggedSet = {
  id: string;
  date: string;
  weight: number | null;
  reps: number | null;
  duration: number | null;
  distance: number | null;
  setIndex: number;
  sessionId: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  sessions: { id: string; weekNumber: number | null; dayLabel: string; order: number }[];
};

type GraphView = "1rm" | "volume" | "heaviest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function localDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildMonthGrid(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const days: { date: Date; inMonth: boolean; key: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    days.push({ date, inMonth: date.getMonth() === month, key });
  }
  return days;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Graph ────────────────────────────────────────────────────────────────────

function ProgressGraph({
  sets,
  view,
  lowerIsBetter,
}: {
  sets: LoggedSet[];
  view: GraphView;
  lowerIsBetter: boolean;
}) {
  // Group by session date — pick best set per session
  const points = useMemo(() => {
    const bySession = new Map<string, LoggedSet[]>();
    for (const s of sets) {
      const key = s.sessionId ?? s.date;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key)!.push(s);
    }

    return [...bySession.entries()]
      .map(([, sessionSets]) => {
        const date = sessionSets[0].date;
        let value: number | null = null;

        if (view === "1rm") {
          const candidates = sessionSets
            .filter((s) => s.weight != null && s.reps != null)
            .map((s) => estimate1RM(s.weight!, s.reps!));
          value = candidates.length > 0
            ? (lowerIsBetter ? Math.min(...candidates) : Math.max(...candidates))
            : null;
        } else if (view === "volume") {
          const total = sessionSets
            .filter((s) => s.weight != null && s.reps != null)
            .reduce((acc, s) => acc + s.weight! * s.reps!, 0);
          value = total > 0 ? Math.round(total) : null;
        } else {
          // heaviest
          const candidates = sessionSets
            .filter((s) => s.weight != null)
            .map((s) => s.weight!);
          value = candidates.length > 0
            ? (lowerIsBetter ? Math.min(...candidates) : Math.max(...candidates))
            : null;
        }

        return { date, value };
      })
      .filter((p) => p.value != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) as { date: string; value: number }[];
  }, [sets, view, lowerIsBetter]);

  if (points.length === 0) {
    return <p style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>No data logged yet.</p>;
  }

  if (points.length === 1) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <p style={{ color: "var(--text)", fontSize: 22, fontWeight: 600 }}>{points[0].value}</p>
        <p style={{ color: "var(--dim)", fontSize: 11 }}>
          {new Date(points[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 300, H = 100, PAD = 12;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const coords = points.map((p, i) => ({
    x: PAD + (i / (points.length - 1)) * innerW,
    y: PAD + (1 - (p.value - min) / range) * innerH,
    value: p.value,
    date: p.date,
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const diff = last.value - first.value;
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const trendColor = diff === 0 ? "#8a8f98" : improved ? "#4ade80" : "#f87171";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#areaGrad)" />
        <path d={pathD} fill="none" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* First and last dots */}
        <circle cx={coords[0].x} cy={coords[0].y} r="3" fill={trendColor} />
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3" fill={trendColor} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
        <span>{new Date(first.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {first.value}</span>
        <span style={{ color: trendColor, fontWeight: 600 }}>
          {diff > 0 ? "+" : ""}{diff}
        </span>
        <span>{new Date(last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {last.value}</span>
      </div>
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ exerciseId, exercise }: { exerciseId: string | null; exercise: ExerciseRow | null }) {
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [graphView, setGraphView] = useState<GraphView>("1rm");

  useEffect(() => {
    if (!exerciseId) return;
    setLoading(true);
    fetch(`/api/client/exercises/${exerciseId}/history`)
      .then((r) => r.json())
      .then((data) => { setSets(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [exerciseId]);

  if (!exerciseId || !exercise) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "var(--dim)", fontSize: 12 }}>Tap an exercise in the session to see your progress.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontWeight: 600, fontSize: 13 }}>{exercise.name}</p>

      {exercise.lowerIsBetter && (
        <p style={{ fontSize: 10, color: "var(--steel)", background: "rgba(92,122,138,0.1)", borderRadius: 4, padding: "3px 6px" }}>
          ↓ Lower is better
        </p>
      )}

      {/* Graph view toggle */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["1rm", "volume", "heaviest"] as GraphView[]).map((v) => (
          <button
            key={v}
            onClick={() => setGraphView(v)}
            style={{
              flex: 1, padding: "4px 0", fontSize: 10, borderRadius: 4,
              border: `1px solid ${graphView === v ? "var(--steel)" : "var(--line)"}`,
              background: graphView === v ? "var(--steel)" : "transparent",
              color: graphView === v ? "#fff" : "var(--dim)",
              cursor: "pointer",
            }}
          >
            {v === "1rm" ? "Est. 1RM" : v === "volume" ? "Volume" : "Heaviest"}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "var(--dim)", fontSize: 12 }}>Loading…</p>
      ) : (
        <ProgressGraph sets={sets} view={graphView} lowerIsBetter={exercise.lowerIsBetter} />
      )}

      {/* Last 5 sessions summary */}
      {sets.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>Recent sets</p>
          {[...sets].reverse().slice(0, 10).map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ color: "var(--dim)" }}>{new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span style={{ color: "var(--text)" }}>
                {s.weight != null ? `${s.weight}kg` : ""}
                {s.reps != null ? ` × ${s.reps}` : ""}
                {s.duration != null ? ` ${s.duration}s` : ""}
                {s.distance != null ? ` ${s.distance}m` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Templates Panel ──────────────────────────────────────────────────────────

function TemplatesPanel() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client/templates")
      .then((r) => r.json())
      .then((data) => { setTemplates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 16 }}><p style={{ color: "var(--dim)", fontSize: 12 }}>Loading…</p></div>;

  if (templates.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "var(--dim)", fontSize: 12 }}>No templates available yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {templates.map((t) => {
        const expanded = expandedId === t.id;
        const weeks = [...new Set(t.sessions.map((s) => s.weekNumber ?? 1))].sort((a, b) => a - b);
        const price = t.price ? `${t.price} ${t.currency ?? "KWD"}` : "Free";

        return (
          <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setExpandedId(expanded ? null : t.id)}
              style={{ width: "100%", padding: "12px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{t.name}</p>
                  <p style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                    {weeks.length} week{weeks.length !== 1 ? "s" : ""} · {t.sessions.length} session{t.sessions.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--steel)" }}>{price}</span>
              </div>
            </button>

            {expanded && (
              <div style={{ borderTop: "1px solid var(--line)", padding: 12, background: "rgba(255,255,255,0.02)" }}>
                {t.description && (
                  <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10, lineHeight: 1.5 }}>{t.description}</p>
                )}

                {/* Week structure preview */}
                {weeks.map((w) => {
                  const days = t.sessions.filter((s) => (s.weekNumber ?? 1) === w).sort((a, b) => a.order - b.order);
                  return (
                    <div key={w} style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4 }}>Week {w}</p>
                      {days.map((d) => (
                        <p key={d.id} style={{ fontSize: 11, color: "var(--text)", paddingLeft: 8, paddingBottom: 2 }}>· {d.dayLabel}</p>
                      ))}
                    </div>
                  );
                })}

                <button
                  style={{
                    width: "100%", marginTop: 8, padding: "8px", borderRadius: 6,
                    background: "var(--steel)", color: "#fff", fontSize: 12,
                    fontWeight: 600, border: "none", cursor: "pointer",
                  }}
                  onClick={() => alert("Payment flow coming soon")}
                >
                  {t.price ? `Unlock for ${price}` : "Add to my program"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Session Preview ──────────────────────────────────────────────────────────

function SessionPreview({
  session,
  onSelectExercise,
}: {
  session: SessionRow | null;
  onSelectExercise: (ex: ExerciseRow) => void;
}) {
  if (!session) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--dim)", fontSize: 13 }}>Select a day to preview the session.</p>
      </div>
    );
  }

  const rows = session.sessionExercises;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <p style={{ fontWeight: 600, fontSize: 14 }}>{session.dayLabel}</p>
        {session.date && (
          <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
            {new Date(session.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 16 }}>
          <p style={{ color: "var(--dim)", fontSize: 12 }}>No exercises in this session yet.</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {rows.map((row, idx) => {
            const isGrouped = !!row.groupId;
            const prevGroupId = idx > 0 ? rows[idx - 1].groupId : null;
            const isFirstInGroup = isGrouped && row.groupId !== prevGroupId;

            return (
              <div key={row.id}>
                {isFirstInGroup && (
                  <div style={{
                    margin: "4px 12px 2px",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: row.groupColor ?? "#e5e7eb",
                    fontSize: 9,
                    fontWeight: 600,
                    color: "#374151",
                    display: "inline-block",
                  }}>
                    {row.setType === "TIME" ? "Circuit" : row.setType === "DISTANCE" ? "Interval" : "Group"}
                  </div>
                )}
                <button
                  onClick={() => onSelectExercise(row.exercise)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 16px", background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                    borderLeft: isGrouped ? `3px solid ${row.groupColor ?? "#e5e7eb"}` : "3px solid transparent",
                  }}
                >
                  {row.exercise.gifUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.exercise.gifUrl} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{row.exercise.name}</p>
                    <p style={{ fontSize: 11, color: "var(--dim)", marginTop: 1 }}>
                      {row.sets != null ? `${row.sets} sets` : ""}
                      {row.reps != null ? ` × ${row.reps} reps` : ""}
                      {row.loadValue != null ? ` @ ${row.loadValue}${row.loadUnit ?? ""}` : ""}
                      {row.coachNote ? ` · ${row.coachNote}` : ""}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--dim)" }}>📊</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
        <a
          href={`/client/session/${session.id}`}
          style={{
            display: "block", textAlign: "center", padding: "8px",
            background: "var(--steel)", color: "#fff", borderRadius: 6,
            fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}
        >
          Start workout →
        </a>
      </div>
    </div>
  );
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({
  cursor,
  setCursor,
  sessionsByKey,
  selectedKey,
  onSelectDay,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  sessionsByKey: Map<string, SessionRow>;
  selectedKey: string | null;
  onSelectDay: (key: string, session: SessionRow) => void;
}) {
  const days = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const today = todayKey();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => setCursor(addMonths(cursor, -1))} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 16 }}>←</button>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{monthLabel}</p>
        <button onClick={() => setCursor(addMonths(cursor, 1))} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 16 }}>→</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, color: "var(--dim)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {days.map(({ date, inMonth, key }) => {
          const session = sessionsByKey.get(key);
          const isToday = key === today;
          const isSelected = key === selectedKey;
          const hasSession = !!session;

          return (
            <div
              key={key}
              onClick={() => session && onSelectDay(key, session)}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: hasSession ? "pointer" : "default",
                opacity: inMonth ? 1 : 0.3,
                background: isSelected
                  ? "var(--steel)"
                  : hasSession
                  ? "rgba(92,122,138,0.15)"
                  : "transparent",
                border: isToday ? "1px solid var(--steel)" : "1px solid transparent",
                transition: "background 0.15s",
              }}
            >
              <span style={{ fontSize: 11, color: isSelected ? "#fff" : "var(--text)", fontWeight: isToday ? 700 : 400 }}>
                {date.getDate()}
              </span>
              {hasSession && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSelected ? "#fff" : "var(--steel)", marginTop: 1 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export function ClientDashboard({ clientName }: { clientName: string }) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseRow | null>(null);
  const [rightTab, setRightTab] = useState<"history" | "templates">("history");

  const monthStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  const fetchSessions = useCallback((month: string) => {
    setLoadingSessions(true);
    fetch(`/api/client/sessions?month=${month}`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoadingSessions(false);
      })
      .catch(() => setLoadingSessions(false));
  }, []);

  useEffect(() => { fetchSessions(monthStr); }, [monthStr, fetchSessions]);

  const sessionsByKey = useMemo(() => {
    const map = new Map<string, SessionRow>();
    for (const s of sessions) {
      if (!s.date) continue;
      map.set(localDateKey(s.date), s);
    }
    return map;
  }, [sessions]);

  function handleSelectDay(key: string, session: SessionRow) {
    setSelectedKey(key);
    setSelectedSession(session);
    setSelectedExercise(null);
    setRightTab("history");
  }

  function handleSelectExercise(ex: ExerciseRow) {
    setSelectedExercise(ex);
    setRightTab("history");
  }

  return (
    <>
      <style>{`
        :root{--bg:#14161a;--panel:#1c1f24;--line:#2a2e35;--text:#edeae4;--dim:#8a8f98;--steel:#5c7a8a;}
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
        button:focus{outline:none;}
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* Left panel — calendar */}
        <div style={{ width: 260, borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid var(--line)" }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{clientName}</p>
            <a href="/client/today" style={{ fontSize: 11, color: "var(--steel)", textDecoration: "none" }}>← Today's session</a>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <MonthCalendar
              cursor={cursor}
              setCursor={setCursor}
              sessionsByKey={sessionsByKey}
              selectedKey={selectedKey}
              onSelectDay={handleSelectDay}
            />
            {loadingSessions && (
              <p style={{ fontSize: 11, color: "var(--dim)", textAlign: "center", marginTop: 12 }}>Loading…</p>
            )}
          </div>
        </div>

        {/* Middle panel — session preview */}
        <div style={{ flex: 1, borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <SessionPreview session={selectedSession} onSelectExercise={handleSelectExercise} />
        </div>

        {/* Right panel — History | Templates */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
            {(["history", "templates"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 12, background: "transparent",
                  border: "none", borderBottom: rightTab === t ? "2px solid var(--steel)" : "2px solid transparent",
                  color: rightTab === t ? "var(--text)" : "var(--dim)",
                  cursor: "pointer", fontWeight: rightTab === t ? 600 : 400,
                }}
              >
                {t === "history" ? "History" : "Templates"}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {rightTab === "history" && (
              <HistoryPanel exerciseId={selectedExercise?.id ?? null} exercise={selectedExercise} />
            )}
            {rightTab === "templates" && <TemplatesPanel />}
          </div>
        </div>

      </div>
    </>
  );
}
