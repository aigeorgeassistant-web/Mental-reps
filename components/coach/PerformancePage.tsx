"use client";

import { useEffect, useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LoggedSet = {
  id: string;
  date: string;
  weight: number | null;
  reps: number | null;
  notes: string | null;
  isPr: boolean;
  setIndex: number;
  exercise: { id: string; name: string; muscleGroups: string[] };
  session: {
    id: string;
    date: string | null;
    checkIn: { sleep: number | null; mood: number | null; hydration: number | null; stress: number | null } | null;
  } | null;
};

type CheckIn = {
  id: string;
  date: string;
  sleep: number | null;
  mood: number | null;
  hydration: number | null;
  stress: number | null;
  session: { date: string | null } | null;
};

type ExerciseSummary = {
  exerciseId: string;
  name: string;
  muscleGroups: string[];
  sessions: SessionData[];
  bestWeight: number;
  bestReps: number;
  bestDate: string;
  trend: "up" | "flat" | "down";
  sessionCount: number;
};

type SessionData = {
  date: string;
  maxWeight: number;
  totalVolume: number;
  estimated1RM: number;
  bestReps: number;
  setCount: number;
  checkIn: { sleep: number | null; mood: number | null; hydration: number | null; stress: number | null } | null;
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function epley(weight: number, reps: number) {
  return Math.round(weight * (1 + reps / 30));
}

function corr(pairs: [number, number][]) {
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  const num = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const den = Math.sqrt(
    pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0) *
    pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0)
  );
  if (den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

function corrLabel(r: number | null) {
  if (r === null) return { text: "not enough data", color: "#888" };
  const abs = Math.abs(r);
  const dir = r > 0 ? "positive" : "negative";
  if (abs >= 0.7) return { text: `strong ${dir}`, color: r > 0 ? "#22c55e" : "#ef4444" };
  if (abs >= 0.4) return { text: `moderate ${dir}`, color: r > 0 ? "#84cc16" : "#f97316" };
  return { text: "weak correlation", color: "#888" };
}

function trendArrow(trend: "up" | "flat" | "down") {
  if (trend === "up") return { sym: "↑", color: "#22c55e" };
  if (trend === "down") return { sym: "↓", color: "#ef4444" };
  return { sym: "→", color: "#888" };
}

function checkinDotColor(ci: { sleep: number | null; mood: number | null; hydration: number | null; stress: number | null } | null) {
  if (!ci) return null;
  const vals = [ci.sleep, ci.mood, ci.hydration].filter((v) => v !== null) as number[];
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 4) return "#22c55e";
  if (avg >= 2.5) return "#f59e0b";
  return "#ef4444";
}

function buildExerciseSummaries(loggedSets: LoggedSet[]): ExerciseSummary[] {
  const byEx = new Map<string, LoggedSet[]>();
  for (const ls of loggedSets) {
    const key = ls.exercise.id;
    if (!byEx.has(key)) byEx.set(key, []);
    byEx.get(key)!.push(ls);
  }

  return Array.from(byEx.entries()).map(([exerciseId, sets]) => {
    const ex = sets[0].exercise;
    // Group by session date
    const bySession = new Map<string, LoggedSet[]>();
    for (const s of sets) {
      const key = s.session?.date ?? s.date;
      const dateKey = key.slice(0, 10);
      if (!bySession.has(dateKey)) bySession.set(dateKey, []);
      bySession.get(dateKey)!.push(s);
    }

    const sessions: SessionData[] = Array.from(bySession.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ss]) => {
        const validSets = ss.filter((s) => s.weight && s.reps);
        const maxWeight = validSets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
        const bestSet = validSets.find((s) => s.weight === maxWeight);
        const bestReps = bestSet?.reps ?? 0;
        const totalVolume = validSets.reduce((t, s) => t + (s.weight ?? 0) * (s.reps ?? 0), 0);
        const estimated1RM = bestSet ? epley(maxWeight, bestReps) : 0;
        return {
          date,
          maxWeight,
          totalVolume: Math.round(totalVolume),
          estimated1RM,
          bestReps,
          setCount: ss.length,
          checkIn: ss[0].session?.checkIn ?? null,
        };
      });

    const allWeights = sets.map((s) => s.weight ?? 0);
    const bestWeight = Math.max(...allWeights);
    const bestSet = sets.find((s) => s.weight === bestWeight);
    const bestReps = bestSet?.reps ?? 0;
    const bestDate = bestSet?.session?.date?.slice(0, 10) ?? bestSet?.date?.slice(0, 10) ?? "";

    const last3 = sessions.slice(-3).map((s) => s.maxWeight);
    let trend: "up" | "flat" | "down" = "flat";
    if (last3.length >= 2) {
      const diff = last3[last3.length - 1] - last3[0];
      if (diff > 1) trend = "up";
      else if (diff < -1) trend = "down";
    }

    return { exerciseId, name: ex.name, muscleGroups: ex.muscleGroups, sessions, bestWeight, bestReps, bestDate, trend, sessionCount: sessions.length };
  }).sort((a, b) => b.sessionCount - a.sessionCount);
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120; const h = 40;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Scatter plot ─────────────────────────────────────────────────────────────

function ScatterPlot({ pairs, color }: { pairs: [number, number][]; color: string }) {
  const W = 120; const H = 70;
  if (!pairs.length) return <div style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#888", textAlign: "center" }}>no data</div>;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs) || 1;
  const minY = Math.min(...ys); const maxY = Math.max(...ys) || 1;
  const pad = 10;
  const toX = (v: number) => pad + ((v - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const toY = (v: number) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - pad * 2);

  // Regression line
  const r = corr(pairs);
  let linePts = "";
  if (r !== null && pairs.length >= 2) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const slope = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0) || 1);
    const intercept = my - slope * mx;
    const x1 = minX; const x2 = maxX;
    const y1 = slope * x1 + intercept;
    const y2 = slope * x2 + intercept;
    linePts = `${toX(x1)},${toY(y1)} ${toX(x2)},${toY(y2)}`;
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {linePts && <polyline points={linePts} fill="none" stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />}
      {pairs.map(([x, y], i) => (
        <circle key={i} cx={toX(x)} cy={toY(y)} r="3.5" fill={color} opacity="0.75" />
      ))}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PerformancePage({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/coach/clients/${clientId}/performance`)
      .then((r) => r.json())
      .then((d) => { setLoggedSets(d.loggedSets ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  const summaries = useMemo(() => buildExerciseSummaries(loggedSets), [loggedSets]);

  const allMuscleGroups = useMemo(() => {
    const s = new Set<string>();
    summaries.forEach((ex) => ex.muscleGroups.forEach((mg) => s.add(mg)));
    return ["All", ...Array.from(s).sort()];
  }, [summaries]);

  const [selectedMG, setSelectedMG] = useState("All");
  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"progress" | "compare">("progress");
  const [chartMetric, setChartMetric] = useState<"maxWeight" | "totalVolume" | "estimated1RM">("maxWeight");
  const [compareExId, setCompareExId] = useState<string | null>(null);

  const filteredSummaries = useMemo(() =>
    selectedMG === "All" ? summaries : summaries.filter((ex) => ex.muscleGroups.includes(selectedMG)),
    [summaries, selectedMG]
  );

  const selected = useMemo(() => summaries.find((ex) => ex.exerciseId === selectedExId) ?? null, [summaries, selectedExId]);
  const compareEx = useMemo(() => summaries.find((ex) => ex.exerciseId === compareExId) ?? null, [summaries, compareExId]);

  // Correlation pairs: checkin metric vs performance delta (% change from prev session)
  function corrPairs(metric: "sleep" | "mood" | "hydration" | "stress", ex: ExerciseSummary) {
    const pairs: [number, number][] = [];
    for (let i = 1; i < ex.sessions.length; i++) {
      const prev = ex.sessions[i - 1];
      const curr = ex.sessions[i];
      const ciVal = curr.checkIn?.[metric];
      if (ciVal == null || prev.maxWeight === 0) continue;
      const delta = ((curr.maxWeight - prev.maxWeight) / prev.maxWeight) * 100;
      pairs.push([ciVal, Math.round(delta * 10) / 10]);
    }
    return pairs;
  }

  // Export CSV
  function exportCSV() {
    const rows = [["Date", "Exercise", "Muscle group", "Set", "Weight (kg)", "Reps", "Volume", "Est 1RM", "Sleep", "Mood", "Hydration", "Stress", "Notes"]];
    for (const ls of loggedSets) {
      const date = (ls.session?.date ?? ls.date ?? "").slice(0, 10);
      const ci = ls.session?.checkIn;
      const vol = (ls.weight ?? 0) * (ls.reps ?? 0);
      const e1rm = ls.weight && ls.reps ? epley(ls.weight, ls.reps) : "";
      rows.push([date, ls.exercise.name, ls.exercise.muscleGroups.join(";"), String(ls.setIndex + 1), String(ls.weight ?? ""), String(ls.reps ?? ""), String(Math.round(vol)), String(e1rm), String(ci?.sleep ?? ""), String(ci?.mood ?? ""), String(ci?.hydration ?? ""), String(ci?.stress ?? ""), ls.notes ?? ""]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `${clientName.replace(/\s+/g, "_")}_performance.csv`;
    a.click();
  }

  // Chart data for selected exercise
  const chartValues = selected?.sessions.map((s) => s[chartMetric]) ?? [];
  const chartDates = selected?.sessions.map((s) => s.date.slice(5)) ?? [];
  const chartDots = selected?.sessions.map((s) => checkinDotColor(s.checkIn)) ?? [];

  // Normalised compare data (% from first session)
  function normalise(sessions: SessionData[]) {
    const base = sessions[0]?.maxWeight;
    if (!base) return [];
    return sessions.map((s) => Math.round(((s.maxWeight - base) / base) * 100));
  }

  // Chart SVG
  function ChartSVG() {
    if (!chartValues.length) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12 }}>No data yet</div>;
    const W = 400; const H = 130; const padL = 32; const padB = 20; const padR = 16; const padT = 10;
    const min = Math.min(...chartValues);
    const max = Math.max(...chartValues) || 1;
    const toX = (i: number) => padL + (i / (chartValues.length - 1 || 1)) * (W - padL - padR);
    const toY = (v: number) => padT + ((max - v) / (max - min || 1)) * (H - padT - padB);
    const pts = chartValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
    const labelEvery = Math.ceil(chartDates.length / 5);
    return (
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", flex: 1 }}>
        <polyline points={pts} fill="none" stroke="#378ADD" strokeWidth="2" strokeLinejoin="round" />
        {chartValues.map((v, i) => {
          const dot = chartDots[i];
          return (
            <g key={i}>
              <circle cx={toX(i)} cy={toY(v)} r="4" fill={dot ?? "#378ADD"} opacity={dot ? 0.9 : 0.5} />
              <title>{chartDates[i]}: {v}{chartMetric === "maxWeight" ? "kg" : chartMetric === "totalVolume" ? "kg vol" : "kg 1RM"}</title>
            </g>
          );
        })}
        {chartDates.map((d, i) => i % labelEvery === 0 && (
          <text key={i} x={toX(i)} y={H - 4} fontSize="8" fill="#aaa" textAnchor="middle">{d}</text>
        ))}
        {[min, Math.round((min + max) / 2), max].map((v, i) => (
          <text key={i} x={padL - 3} y={toY(v) + 3} fontSize="8" fill="#aaa" textAnchor="end">{Math.round(v)}</text>
        ))}
      </svg>
    );
  }

  // Compare chart SVG
  function CompareChartSVG() {
    if (!selected || !compareEx) return null;
    const n1 = normalise(selected.sessions);
    const n2 = normalise(compareEx.sessions);
    if (!n1.length && !n2.length) return <div style={{ color: "#888", fontSize: 12 }}>No data</div>;
    const W = 400; const H = 130; const padL = 36; const padB = 20; const padR = 16; const padT = 10;
    const allVals = [...n1, ...n2];
    const min = Math.min(0, ...allVals);
    const max = Math.max(0, ...allVals) || 1;
    const toY = (v: number) => padT + ((max - v) / (max - min || 1)) * (H - padT - padB);
    const toX1 = (i: number) => padL + (i / (n1.length - 1 || 1)) * (W - padL - padR);
    const toX2 = (i: number) => padL + (i / (n2.length - 1 || 1)) * (W - padL - padR);
    const pts1 = n1.map((v, i) => `${toX1(i)},${toY(v)}`).join(" ");
    const pts2 = n2.map((v, i) => `${toX2(i)},${toY(v)}`).join(" ");
    const zeroY = toY(0);
    const prog1 = n1[n1.length - 1] ?? 0;
    const prog2 = n2[n2.length - 1] ?? 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#ddd" strokeWidth="0.5" strokeDasharray="3,2" />
          {pts1 && <polyline points={pts1} fill="none" stroke="#378ADD" strokeWidth="2" strokeLinejoin="round" />}
          {pts2 && <polyline points={pts2} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />}
          {[min, 0, max].map((v, i) => (
            <text key={i} x={padL - 3} y={toY(v) + 3} fontSize="8" fill="#aaa" textAnchor="end">{Math.round(v)}%</text>
          ))}
        </svg>
        <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
          <span style={{ color: "#378ADD" }}>■ {selected.name}: <strong>{prog1 >= 0 ? "+" : ""}{prog1}%</strong></span>
          <span style={{ color: "#8b5cf6" }}>■ {compareEx.name}: <strong>{prog2 >= 0 ? "+" : ""}{prog2}%</strong></span>
        </div>
        {n1.length > 0 && n2.length > 0 && (
          <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 6, background: "#f5f5f5", color: "#555" }}>
            {Math.abs(prog1) > Math.abs(prog2)
              ? `${selected.name} progressed ${Math.abs(prog1 - prog2)}% faster than ${compareEx.name}`
              : prog2 !== prog1
              ? `${compareEx.name} progressed ${Math.abs(prog2 - prog1)}% faster than ${selected.name}`
              : "Both exercises progressed equally"}
          </div>
        )}
      </div>
    );
  }

  const S: Record<string, React.CSSProperties> = {
    page: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "var(--font-sans, system-ui)", fontSize: 13, color: "var(--text-primary, #1a1a1a)", background: "#fff" },
    topbar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "0.5px solid #e5e5e5", flexShrink: 0 },
    body: { display: "flex", flex: 1, overflow: "hidden" },
    sidebar: { width: 108, flexShrink: 0, borderRight: "0.5px solid #e5e5e5", background: "#fafafa", padding: "8px 0", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" },
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    exStrip: { padding: "10px 12px", borderBottom: "0.5px solid #e5e5e5", display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 },
    detail: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    tabBar: { display: "flex", borderBottom: "0.5px solid #e5e5e5", padding: "0 12px", flexShrink: 0 },
    detailBody: { display: "flex", flex: 1, overflow: "hidden" },
    chartArea: { flex: 1, padding: 12, borderRight: "0.5px solid #e5e5e5", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" },
    sidePanel: { width: 156, flexShrink: 0, padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" },
    sessionTable: { padding: "0 12px 8px", overflowY: "auto", flexShrink: 0, maxHeight: 130 },
    corrSection: { borderTop: "0.5px solid #e5e5e5", padding: "10px 12px", background: "#fafafa", flexShrink: 0 },
  };

  if (loading) return <div style={{ padding: 40, color: "#888", fontSize: 13 }}>Loading performance data…</div>;

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topbar}>
        <a href={`/coach/clients/${clientId}/builder`} style={{ fontSize: 12, color: "#888", textDecoration: "none" }}>← Builder</a>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{clientName}</span>
        <span style={{ fontSize: 12, color: "#888" }}>Performance</span>
        <button onClick={exportCSV} style={{ marginLeft: "auto", fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "0.5px solid #ddd", background: "#fff", color: "#555", cursor: "pointer" }}>
          Export CSV
        </button>
      </div>

      <div style={S.body}>
        {/* Sidebar — muscle groups */}
        <div style={S.sidebar}>
          <div style={{ fontSize: 9, color: "#aaa", padding: "4px 10px 6px", textTransform: "uppercase", letterSpacing: ".05em" }}>Muscle group</div>
          {allMuscleGroups.map((mg) => {
            const count = mg === "All" ? summaries.length : summaries.filter((ex) => ex.muscleGroups.includes(mg)).length;
            const active = selectedMG === mg;
            return (
              <button key={mg} onClick={() => { setSelectedMG(mg); setSelectedExId(null); }} style={{ padding: "6px 10px", fontSize: 11, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", background: active ? "#EBF4FF" : "transparent", color: active ? "#185FA5" : "#555", fontWeight: active ? 500 : 400, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                {mg}
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: active ? "#185FA5" : "#eee", color: active ? "#fff" : "#888" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Main */}
        <div style={S.main}>
          {/* Exercise strip */}
          <div style={S.exStrip}>
            <span style={{ fontSize: 9, color: "#aaa", alignSelf: "center", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 4 }}>{selectedMG}</span>
            {filteredSummaries.length === 0 && <span style={{ fontSize: 12, color: "#aaa" }}>No logged data for this muscle group yet.</span>}
            {filteredSummaries.map((ex) => {
              const active = selectedExId === ex.exerciseId;
              const tr = trendArrow(ex.trend);
              return (
                <button key={ex.exerciseId} onClick={() => { setSelectedExId(active ? null : ex.exerciseId); setActiveTab("progress"); setCompareExId(null); }} style={{ border: `0.5px solid ${active ? "#378ADD" : "#e5e5e5"}`, borderRadius: 8, padding: "7px 10px", background: active ? "#EBF4FF" : "#fafafa", cursor: "pointer", textAlign: "left", minWidth: 110, fontFamily: "inherit" }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: active ? "#185FA5" : "#1a1a1a", marginBottom: 3 }}>{ex.name}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>{ex.sessionCount} session{ex.sessionCount !== 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 10, color: tr.color }}>{tr.sym} {ex.bestWeight}kg × {ex.bestReps}</div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          {selected ? (
            <div style={S.detail}>
              {/* Tabs */}
              <div style={S.tabBar}>
                {(["progress", "compare"] as const).map((t) => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{ fontSize: 11, padding: "7px 12px", color: activeTab === t ? "#185FA5" : "#888", borderBottom: activeTab === t ? "2px solid #378ADD" : "2px solid transparent", borderTop: "none", borderLeft: "none", borderRight: "none", fontWeight: activeTab === t ? 500 : 400, background: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {activeTab === "progress" && (
                <div style={S.detailBody}>
                  {/* Chart */}
                  <div style={S.chartArea}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["maxWeight", "totalVolume", "estimated1RM"] as const).map((m) => (
                        <button key={m} onClick={() => setChartMetric(m)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, border: `0.5px solid ${chartMetric === m ? "#378ADD" : "#ddd"}`, color: chartMetric === m ? "#185FA5" : "#888", background: chartMetric === m ? "#EBF4FF" : "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                          {m === "maxWeight" ? "Max weight" : m === "totalVolume" ? "Volume" : "Est. 1RM"}
                        </button>
                      ))}
                    </div>
                    <div style={{ flex: 1, border: "0.5px solid #e5e5e5", borderRadius: 8, background: "#fafafa", overflow: "hidden", display: "flex", minHeight: 130 }}>
                      <ChartSVG />
                    </div>
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#aaa", flexWrap: "wrap" }}>
                      {[{ c: "#378ADD", l: "Max weight" }, { c: "#22c55e", l: "Good check-in" }, { c: "#f59e0b", l: "Avg check-in" }, { c: "#ef4444", l: "Poor check-in" }].map((item) => (
                        <span key={item.l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.c, display: "inline-block" }} />
                          {item.l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div style={S.sidePanel}>
                    {[
                      { label: "Best ever", val: `${selected.bestWeight}kg`, sub: `× ${selected.bestReps} · ${selected.bestDate.slice(5)}` },
                      { label: "Est. 1RM", val: `${epley(selected.bestWeight, selected.bestReps)}kg`, sub: "Epley formula" },
                      { label: "Progression", val: (() => { const v = normalise(selected.sessions); const p = v[v.length - 1] ?? 0; return `${p >= 0 ? "+" : ""}${p}%`; })(), sub: "vs first session", color: (() => { const v = normalise(selected.sessions); return (v[v.length - 1] ?? 0) >= 0 ? "#22c55e" : "#ef4444"; })() },
                      { label: "Sessions", val: String(selected.sessionCount), sub: "logged total" },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "#f5f5f5", borderRadius: 8, border: "0.5px solid #e5e5e5", padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 500, color: s.color ?? "#1a1a1a" }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "compare" && (
                <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>Compare <strong style={{ color: "#185FA5" }}>{selected.name}</strong> vs:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {summaries.filter((ex) => ex.exerciseId !== selected.exerciseId).map((ex) => (
                      <button key={ex.exerciseId} onClick={() => setCompareExId(ex.exerciseId === compareExId ? null : ex.exerciseId)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${compareExId === ex.exerciseId ? "#8b5cf6" : "#e5e5e5"}`, background: compareExId === ex.exerciseId ? "#f3f0ff" : "#fafafa", color: compareExId === ex.exerciseId ? "#6d28d9" : "#555", cursor: "pointer", fontFamily: "inherit" }}>
                        {ex.name}
                      </button>
                    ))}
                  </div>
                  {compareEx && <CompareChartSVG />}
                  {!compareEx && <div style={{ color: "#aaa", fontSize: 12 }}>Select an exercise to compare</div>}
                </div>
              )}

              {/* Session table */}
              <div style={S.sessionTable}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr>{["Date", "Sets", "Best set", "Volume", "Check-in"].map((h) => (
                      <th key={h} style={{ color: "#aaa", padding: "4px 6px", textAlign: "left", borderBottom: "0.5px solid #eee", fontWeight: 400 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {[...selected.sessions].reverse().map((s) => (
                      <tr key={s.date}>
                        <td style={{ padding: "4px 6px", color: "#888", borderBottom: "0.5px solid #eee" }}>{s.date.slice(5)}</td>
                        <td style={{ padding: "4px 6px", color: "#1a1a1a", fontFamily: "monospace", borderBottom: "0.5px solid #eee" }}>{s.setCount}</td>
                        <td style={{ padding: "4px 6px", color: "#1a1a1a", fontFamily: "monospace", borderBottom: "0.5px solid #eee" }}>{s.maxWeight}×{s.bestReps}</td>
                        <td style={{ padding: "4px 6px", color: "#1a1a1a", fontFamily: "monospace", borderBottom: "0.5px solid #eee" }}>{s.totalVolume.toLocaleString()}kg</td>
                        <td style={{ padding: "4px 6px", borderBottom: "0.5px solid #eee" }}>
                          <div style={{ display: "flex", gap: 3 }}>
                            {s.checkIn && (["sleep", "mood"] as const).map((k) => s.checkIn![k] !== null && (
                              <span key={k} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 4, background: k === "sleep" ? "#e0f2fe" : "#fef3c7", color: k === "sleep" ? "#0369a1" : "#92400e" }}>
                                {k === "sleep" ? "😴" : "🧠"} {s.checkIn![k]}
                              </span>
                            ))}
                            {!s.checkIn && <span style={{ color: "#ddd", fontSize: 9 }}>—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Correlation plots */}
              <div style={S.corrSection}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#888", marginBottom: 8 }}>Check-in correlations — {selected.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    { key: "sleep", label: "😴 Sleep", color: "#378ADD" },
                    { key: "mood", label: "🧠 Mood", color: "#8b5cf6" },
                    { key: "stress", label: "⚡ Stress", color: "#ef4444" },
                    { key: "hydration", label: "💧 Hydration", color: "#06b6d4" },
                  ] as const).map(({ key, label, color }) => {
                    const pairs = corrPairs(key, selected);
                    const r = corr(pairs);
                    const cl = corrLabel(r);
                    return (
                      <div key={key} style={{ border: "0.5px solid #e5e5e5", borderRadius: 8, padding: 8, background: "#fff", flex: "1 1 120px" }}>
                        <div style={{ fontSize: 10, fontWeight: 500, color: "#555", marginBottom: 4 }}>{label} vs performance</div>
                        <ScatterPlot pairs={pairs} color={color} />
                        <div style={{ fontSize: 9, color: "#aaa", marginTop: 4 }}>
                          {r !== null ? <>r = <span style={{ color: cl.color, fontWeight: 500 }}>{r}</span> · {cl.text}</> : <span style={{ color: "#bbb" }}>need 3+ sessions with check-in</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>
              Select an exercise to see performance details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
