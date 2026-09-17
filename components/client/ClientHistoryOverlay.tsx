// components/client/ClientHistoryOverlay.tsx
// Full-screen overlay: Exercises | Body Scans | Check-ins
// Sticky tabs, 30d / 3m / All time range toggle per tab.

"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeRange = "30d" | "3m" | "all";
type ExerciseTab = "maxwt" | "volume" | "e1rm";

type RawSet = {
  id: string; displayDate: string; weight: number | null;
  reps: number | null; sessionId: string | null; setIndex: number;
};
type SessionAgg = { date: string; maxWt: number; volume: number; e1rm: number; sets: number };
type LoggedExercise = { exerciseId: string; name: string };

type BodyScan = {
  id: string; scannedAt: string;
  weight: number | null; muscleMass: number | null; fatPercent: number | null;
  visceralFat: number | null; bmr: number | null; phaseAngle: number | null;
};

type CheckInRow = {
  id: string; date: string;
  sleep: number | null; mood: number | null; hydration: number | null; stress: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function epley(w: number, r: number) { return r === 1 ? w : w * (1 + r / 30); }

function filterByRange<T extends { date?: string; scannedAt?: string; displayDate?: string }>(
  items: T[], range: TimeRange, dateKey: keyof T
): T[] {
  if (range === "all") return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (range === "30d" ? 30 : 90));
  return items.filter((item) => {
    const d = item[dateKey] as string | undefined;
    return d ? new Date(d) >= cutoff : false;
  });
}

function computeAggregates(sets: RawSet[]): SessionAgg[] {
  const map = new Map<string, { maxWt: number; volume: number; e1rmMax: number; count: number }>();
  for (const s of sets) {
    if (!s.displayDate || s.weight == null || s.reps == null) continue;
    const key = s.displayDate;
    const existing = map.get(key) ?? { maxWt: 0, volume: 0, e1rmMax: 0, count: 0 };
    existing.maxWt = Math.max(existing.maxWt, s.weight);
    existing.volume += s.weight * s.reps;
    existing.e1rmMax = Math.max(existing.e1rmMax, epley(s.weight, s.reps));
    existing.count++;
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, maxWt: v.maxWt, volume: Math.round(v.volume), e1rm: Math.round(v.e1rmMax), sets: v.count }));
}

// ─── Tiny inline SVG sparkline/chart ─────────────────────────────────────────
function LineChart({ points, color = "var(--accent)", height = 80 }: {
  points: { x: number; y: number }[]; color?: string; height?: number;
}) {
  if (points.length < 2) return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)", fontSize: 12 }}>
      Not enough data
    </div>
  );
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 320, H = height;
  const pad = { t: 8, b: 20, l: 44, r: 8 };
  const cx = (x: number) => pad.l + ((x - minX) / (maxX - minX || 1)) * (W - pad.l - pad.r);
  const cy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY || 1)) * (H - pad.t - pad.b);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${cx(p.x).toFixed(1)},${cy(p.y).toFixed(1)}`).join(" ");

  // Y axis labels
  const yTicks = [minY, (minY + maxY) / 2, maxY].map((v) => Math.round(v));
  // X axis: first and last date label
  const xLabels = [points[0], points[points.length - 1]];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
      {/* Y grid lines + labels */}
      {yTicks.map((v, i) => {
        const y = cy(v);
        return (
          <g key={i}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--line)" strokeWidth="0.5" />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" fontSize="9" fill="var(--dim)">{v}</text>
          </g>
        );
      })}
      {/* Line */}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={cx(p.x)} cy={cy(p.y)} r="3" fill={color} />
      ))}
      {/* X labels */}
      {xLabels.map((p, i) => (
        <text key={i} x={cx(p.x)} y={H - 4} textAnchor={i === 0 ? "start" : "end"} fontSize="9" fill="var(--dim)">
          {new Date(p.x).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </text>
      ))}
    </svg>
  );
}

// ─── Range toggle ─────────────────────────────────────────────────────────────
function RangePicker({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  const opts: { v: TimeRange; label: string }[] = [
    { v: "30d", label: "30d" }, { v: "3m", label: "3m" }, { v: "all", label: "All" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 8, padding: 3, border: "1px solid var(--line)" }}>
      {opts.map(({ v, label }) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 700,
          background: value === v ? "var(--panel)" : "transparent",
          color: value === v ? "var(--text)" : "var(--dim)",
          cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
          boxShadow: value === v ? "0 1px 3px rgba(0,0,0,.3)" : "none",
        }}>{label}</button>
      ))}
    </div>
  );
}

// ─── EXERCISES TAB ────────────────────────────────────────────────────────────
function ExercisesTab({ defaultUnit }: { defaultUnit: string }) {
  const [exercises, setExercises] = useState<LoggedExercise[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LoggedExercise | null>(null);
  const [sets, setSets] = useState<RawSet[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [metric, setMetric] = useState<ExerciseTab>("maxwt");
  const [range, setRange] = useState<TimeRange>("3m");

  useEffect(() => {
    fetch("/api/client/logged-exercises")
      .then((r) => r.json())
      .then((d) => { setExercises(d.exercises ?? []); setLoadingList(false); })
      .catch(() => setLoadingList(false));
  }, []);

  function selectExercise(ex: LoggedExercise) {
    setSelected(ex);
    setLoadingDetail(true);
    fetch(`/api/client/exercises/${ex.exerciseId}/history`)
      .then((r) => r.json())
      .then((d) => { setSets(d.sets ?? []); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  }

  const filtered = exercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const aggs = computeAggregates(sets);
  const filteredAggs = filterByRange(aggs, range, "date");
  const chartPoints = filteredAggs.map((a) => ({
    x: new Date(a.date).getTime(),
    y: metric === "maxwt" ? a.maxWt : metric === "volume" ? a.volume : a.e1rm,
  }));

  const metricOpts: { v: ExerciseTab; label: string }[] = [
    { v: "maxwt", label: `Max ${defaultUnit}` },
    { v: "volume", label: "Volume" },
    { v: "e1rm", label: "Est. 1RM" },
  ];

  if (selected) {
    const best = sets.reduce<RawSet | null>((b, s) => {
      if (s.weight == null || s.reps == null) return b;
      if (!b || epley(s.weight, s.reps) > epley(b.weight!, b.reps!)) return s;
      return b;
    }, null);

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { setSelected(null); setSets([]); }} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 8, color: "var(--dim)", fontSize: 13, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", flex: 1 }}>{selected.name}</div>
          {best && (
            <div style={{ fontSize: 11, color: "var(--good)", fontWeight: 700 }}>🏆 {best.weight}kg × {best.reps}</div>
          )}
        </div>

        <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1 }}>
          {/* Metric + range toggles */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {metricOpts.map(({ v, label }) => (
                <button key={v} onClick={() => setMetric(v)} style={{
                  padding: "5px 10px", borderRadius: 7, border: `1px solid ${metric === v ? "var(--accent)" : "var(--line)"}`,
                  background: metric === v ? "rgba(255,75,62,.12)" : "transparent",
                  color: metric === v ? "var(--accent)" : "var(--dim)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{label}</button>
              ))}
            </div>
            <RangePicker value={range} onChange={setRange} />
          </div>

          {loadingDetail ? (
            <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)", fontSize: 12 }}>Loading…</div>
          ) : (
            <LineChart points={chartPoints} color="var(--accent)" height={120} />
          )}

          {/* Recent sessions */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Recent Sessions</div>
            {filteredAggs.slice(-8).reverse().map((a) => (
              <div key={a.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{a.maxWt}kg</span>
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Vol {a.volume}</span>
                  <span style={{ fontSize: 11, color: "var(--steel)" }}>1RM ~{a.e1rm}</span>
                </div>
              </div>
            ))}
            {filteredAggs.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12, padding: "16px 0" }}>No sessions in this range.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
        <input
          type="search" placeholder="Search exercises..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)", fontSize: 14, padding: "9px 14px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 24px" }}>
        {loadingList && <div style={{ color: "var(--dim)", fontSize: 13, padding: 16, textAlign: "center" }}>Loading…</div>}
        {!loadingList && filtered.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 13, padding: 16, textAlign: "center" }}>No exercises found.</div>
        )}
        {filtered.map((ex) => (
          <button key={ex.exerciseId} onClick={() => selectExercise(ex)} style={{
            width: "100%", padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 6,
            color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          }}>
            {ex.name}
            <span style={{ color: "var(--dim)", fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── BODY SCANS TAB ───────────────────────────────────────────────────────────
function BodyScansTab() {
  const [scans, setScans] = useState<BodyScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("3m");
  const [metric, setMetric] = useState<"weight" | "muscleMass" | "fatPercent">("weight");

  useEffect(() => {
    fetch("/api/client/body-scans")
      .then((r) => r.json())
      .then((d) => { setScans(d.scans ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filterByRange(scans, range, "scannedAt");
  const chartPoints = filtered
    .filter((s) => s[metric] != null)
    .map((s) => ({ x: new Date(s.scannedAt).getTime(), y: s[metric] as number }));

  const metricOpts: { v: "weight" | "muscleMass" | "fatPercent"; label: string; color: string }[] = [
    { v: "weight", label: "Weight", color: "var(--accent)" },
    { v: "muscleMass", label: "Muscle", color: "var(--good)" },
    { v: "fatPercent", label: "Fat %", color: "#f59e0b" },
  ];

  const latest = filtered[filtered.length - 1];

  return (
    <div style={{ padding: "14px 14px 24px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {metricOpts.map(({ v, label, color }) => (
            <button key={v} onClick={() => setMetric(v)} style={{
              padding: "5px 10px", borderRadius: 7, border: `1px solid ${metric === v ? color : "var(--line)"}`,
              background: metric === v ? `${color}22` : "transparent",
              color: metric === v ? color : "var(--dim)",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>{label}</button>
          ))}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {loading ? (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)", fontSize: 12 }}>Loading…</div>
      ) : scans.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--dim)", fontSize: 13 }}>
          No body scans yet.<br /><span style={{ fontSize: 11, opacity: 0.6 }}>Use the InBody scan option in Check-in.</span>
        </div>
      ) : (
        <>
          <LineChart points={chartPoints} color={metricOpts.find((m) => m.v === metric)?.color ?? "var(--accent)"} height={120} />

          {/* Latest values card */}
          {latest && (
            <div style={{ marginTop: 16, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                Latest — {new Date(latest.scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {([
                  { key: "weight", label: "Weight", unit: "kg" },
                  { key: "muscleMass", label: "Muscle", unit: "kg" },
                  { key: "fatPercent", label: "Fat", unit: "%" },
                  { key: "visceralFat", label: "Visceral", unit: "" },
                  { key: "bmr", label: "BMR", unit: "kcal" },
                  { key: "phaseAngle", label: "Phase °", unit: "" },
                ] as { key: keyof BodyScan; label: string; unit: string }[]).map(({ key, label, unit }) =>
                  latest[key] != null ? (
                    <div key={key} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{latest[key]}{unit}</div>
                      <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, marginTop: 2 }}>{label}</div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Scan history list */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>All Scans</div>
            {filtered.slice().reverse().map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{new Date(s.scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</div>
                <div style={{ display: "flex", gap: 14 }}>
                  {s.weight != null && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{s.weight}kg</span>}
                  {s.muscleMass != null && <span style={{ fontSize: 11, color: "var(--good)" }}>{s.muscleMass}kg M</span>}
                  {s.fatPercent != null && <span style={{ fontSize: 11, color: "#f59e0b" }}>{s.fatPercent}% F</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CHECK-INS TAB ────────────────────────────────────────────────────────────
function CheckInsTab() {
  const [checkIns, setCheckIns] = useState<CheckInRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>("3m");
  const [metric, setMetric] = useState<"sleep" | "mood" | "hydration" | "stress">("sleep");

  useEffect(() => {
    fetch("/api/client/performance")
      .then((r) => r.json())
      .then((d) => {
        const ci = (d.checkIns ?? []).map((c: any) => ({
          id: c.id,
          date: (c.session?.date ?? c.date ?? "").slice(0, 10),
          sleep: c.sleep, mood: c.mood, hydration: c.hydration, stress: c.stress,
        }));
        setCheckIns(ci);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filterByRange(checkIns, range, "date");
  const chartPoints = filtered
    .filter((c) => c[metric] != null)
    .map((c) => ({ x: new Date(c.date).getTime(), y: c[metric] as number }));

  const metricOpts: { v: "sleep" | "mood" | "hydration" | "stress"; label: string; emoji: string; color: string }[] = [
    { v: "sleep", label: "Sleep", emoji: "😴", color: "#818cf8" },
    { v: "mood", label: "Mood", emoji: "🧠", color: "#34d399" },
    { v: "hydration", label: "Hydration", emoji: "💧", color: "#38bdf8" },
    { v: "stress", label: "Stress", emoji: "⚡", color: "#f87171" },
  ];

  // Simple averages over filtered range
  const avg = (key: keyof CheckInRow) => {
    const vals = filtered.map((c) => c[key] as number | null).filter((v) => v != null) as number[];
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  };

  return (
    <div style={{ padding: "14px 14px 24px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {metricOpts.map(({ v, label, emoji, color }) => (
            <button key={v} onClick={() => setMetric(v)} style={{
              padding: "5px 10px", borderRadius: 7, border: `1px solid ${metric === v ? color : "var(--line)"}`,
              background: metric === v ? `${color}22` : "transparent",
              color: metric === v ? color : "var(--dim)",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>{emoji} {label}</button>
          ))}
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {loading ? (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)", fontSize: 12 }}>Loading…</div>
      ) : checkIns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--dim)", fontSize: 13 }}>No check-ins logged yet.</div>
      ) : (
        <>
          <LineChart
            points={chartPoints}
            color={metricOpts.find((m) => m.v === metric)?.color ?? "var(--accent)"}
            height={120}
          />

          {/* Averages */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
            {metricOpts.map(({ v, label, emoji, color }) => (
              <div key={v} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color }}>{avg(v)}</div>
                <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600, marginTop: 2 }}>{emoji} avg</div>
              </div>
            ))}
          </div>

          {/* Recent list */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Recent</div>
            {filtered.slice(-10).reverse().map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["sleep", "mood", "hydration", "stress"] as const).map((k, i) => (
                    c[k] != null ? (
                      <span key={k} style={{ fontSize: 12, fontWeight: 700, color: metricOpts[i].color }}>{c[k]}</span>
                    ) : null
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN OVERLAY ─────────────────────────────────────────────────────────────
type Tab = "exercises" | "scans" | "checkins";

export function ClientHistoryOverlay({ onClose, defaultUnit }: { onClose: () => void; defaultUnit: string }) {
  const [tab, setTab] = useState<Tab>("exercises");

  const tabs: { v: Tab; label: string }[] = [
    { v: "exercises", label: "Exercises" },
    { v: "scans", label: "Body Scans" },
    { v: "checkins", label: "Check-ins" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px 10px" }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>History</div>
        </div>
        {/* Sticky tabs */}
        <div style={{ display: "flex", padding: "0 14px" }}>
          {tabs.map(({ v, label }) => (
            <button key={v} onClick={() => setTab(v)} style={{
              flex: 1, padding: "9px 0", background: "transparent", border: "none",
              borderBottom: `2px solid ${tab === v ? "var(--accent)" : "transparent"}`,
              color: tab === v ? "var(--text)" : "var(--dim)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Tab content — scrolls independently */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "exercises" && <ExercisesTab defaultUnit={defaultUnit} />}
        {tab === "scans" && <BodyScansTab />}
        {tab === "checkins" && <CheckInsTab />}
      </div>
    </div>
  );
}
