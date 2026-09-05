"use client";
// components/client/TodayWorkout.tsx — v3
// Changes from v2:
//   - Re-logging overwrites (upsert via sessionExerciseId+setIndex)
//   - Superset: collapsible group card, color outline, accordion (one open at a time)
//   - Individual exercises inside groups also collapsible (open by default)
//   - Per-set note field (saved to DB via log-set)
//   - Calendar popup with month grid, session dots, open/move workflow
//   - /client/session/[sessionId] navigation for "Open workout"

import { useEffect, useRef, useState } from "react";
import type { Exercise, Session, SessionExercise, Units } from "@prisma/client";
import { parseIntervalTarget, resolveGroupTarget } from "@/lib/timerNotation";

type Row = SessionExercise & { exercise: Exercise };
type SessionWithRows = Session & { sessionExercises: Row[] };
type CalSession = { id: string; date: string; dayLabel: string };

type Block =
  | { kind: "single"; row: Row }
  | { kind: "superset"; rows: Row[]; color: string | null }
  | { kind: "circuit"; rows: Row[]; color: string | null; rounds: number; workSec: number; restSec: number }
  | { kind: "interval"; rows: Row[]; color: string | null }
  | { kind: "emom"; rows: Row[]; color: string | null; roundSec: number };

type SetState = { weight: number; reps: number; done: boolean; isPr?: boolean; note: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBlocks(rows: Row[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (!row.groupId) { blocks.push({ kind: "single", row }); i++; continue; }
    let j = i;
    const groupRows: Row[] = [];
    while (j < rows.length && rows[j].groupId === row.groupId) { groupRows.push(rows[j]); j++; }
    const color = groupRows[0].groupColor ?? null;
    const firstParsed = parseIntervalTarget(groupRows[0].target);
    if (firstParsed.kind === "interval" && firstParsed.rounds !== null) {
      const isCircuit = groupRows.slice(1).every((r) => { const p = parseIntervalTarget(r.target); return !(p.kind === "interval" && p.rounds !== null); });
      if (isCircuit) { blocks.push({ kind: "circuit", rows: groupRows, color, rounds: firstParsed.rounds, workSec: firstParsed.workSec, restSec: firstParsed.restSec }); i = j; continue; }
    }
    if (firstParsed.kind === "interval") { blocks.push({ kind: "interval", rows: groupRows, color }); i = j; continue; }
    if (firstParsed.kind === "emom") { blocks.push({ kind: "emom", rows: groupRows, color, roundSec: firstParsed.roundSec }); i = j; continue; }
    blocks.push({ kind: "superset", rows: groupRows, color });
    i = j;
  }
  return blocks;
}

function formatTarget(row: Row): string {
  const p = parseIntervalTarget(row.target);
  if (p.kind === "interval") return p.rounds ? `${p.workSec}/${p.restSec}×${p.rounds}` : `${p.workSec}/${p.restSec}`;
  if (p.kind === "emom") return p.reps ? `EMOM ${p.roundSec}s ×${p.reps}` : `EMOM ${p.roundSec}s`;
  const parts: string[] = [];
  if (row.sets && row.reps) parts.push(`${row.sets}×${row.reps}`);
  else if (row.reps) parts.push(`${row.reps} reps`);
  if (row.loadValue) parts.push(`${row.loadValue}${row.loadUnit?.toLowerCase() ?? ""}`);
  return parts.join("  ") || "";
}

function ytLink(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://youtube.com/watch?v=${m[1]}` : null;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m > 0 ? m + ":" : ""}${String(s).padStart(2, "0")}`;
}

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

// ─── GIF overlay ──────────────────────────────────────────────────────────────

function GifOverlay({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <img src={url} alt={name} style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }} />
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", fontSize: 22, width: 40, height: 40, borderRadius: 20, cursor: "pointer" }}>✕</button>
    </div>
  );
}

// ─── Drum picker ──────────────────────────────────────────────────────────────

function DrumPicker({ values, initial, onConfirm, onClose, label }: {
  values: number[]; initial: number; onConfirm: (v: number) => void; onClose: () => void; label: string;
}) {
  const ITEM_H = 52;
  const [selected, setSelected] = useState(() => { const idx = values.indexOf(initial); return idx >= 0 ? idx : 0; });
  const [manual, setManual] = useState(false);
  const [manualVal, setManualVal] = useState(String(initial));
  const listRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0); const startIdx = useRef(0); const dragging = useRef(false);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = selected * ITEM_H; }, []);

  function onTouchStart(e: React.TouchEvent) { startY.current = e.touches[0].clientY; startIdx.current = selected; dragging.current = true; }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = Math.round((startY.current - e.touches[0].clientY) / ITEM_H);
    const next = Math.max(0, Math.min(values.length - 1, startIdx.current + delta));
    setSelected(next);
    if (listRef.current) listRef.current.scrollTop = next * ITEM_H;
  }
  function onTouchEnd() { dragging.current = false; }
  function onScroll() { if (!listRef.current || dragging.current) return; setSelected(Math.max(0, Math.min(values.length - 1, Math.round(listRef.current.scrollTop / ITEM_H)))); }
  function pick(v: number) { onConfirm(v); onClose(); }
  function submitManual() { const v = parseFloat(manualVal); if (!isNaN(v)) { onConfirm(v); onClose(); } }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--panel)", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 400, padding: "20px 20px 36px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 16, textAlign: "center" }}>{label}</div>
        {!manual ? (
          <div style={{ position: "relative", height: ITEM_H * 5, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H, background: "rgba(255,255,255,.06)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", pointerEvents: "none", borderRadius: 8 }} />
            <div ref={listRef} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
              style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2 }}>
              {values.map((v, i) => (
                <div key={i} onClick={() => pick(v)} style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "start", fontSize: i === selected ? 30 : 20, fontWeight: i === selected ? 800 : 400, color: i === selected ? "var(--text)" : "var(--dim)", transition: "all .1s", cursor: "pointer", fontFamily: "monospace" }}>
                  {v % 1 === 0 ? v : v.toFixed(1)}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 0", display: "flex", gap: 8 }}>
            <input type="number" value={manualVal} onChange={(e) => setManualVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitManual()} autoFocus
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)", fontSize: 24, fontWeight: 700, padding: "12px 16px", textAlign: "center", fontFamily: "monospace" }} />
            <button onClick={submitManual} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--good)", color: "#0c1a10", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✓</button>
          </div>
        )}
        <button onClick={() => setManual((v) => !v)} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "var(--dim)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
          {manual ? "Back to scroll" : "Manual entry"}
        </button>
      </div>
    </div>
  );
}

// ─── Timers ───────────────────────────────────────────────────────────────────

type TimerConfig = { exercises: { name: string; gifUrl: string | null; workSec: number; restSec: number }[]; rounds: number; mode: "interval" | "circuit" };
type EmomConfig = { exercises: { name: string; gifUrl: string | null; reps: number | null }[]; roundSec: number };

function IntervalTimer({ config, onClose }: { config: TimerConfig; onClose: () => void }) {
  const total = config.exercises.length; const totalR = config.rounds;
  const [round, setRound] = useState(1); const [exIdx, setExIdx] = useState(0);
  const [phase, setPhase] = useState<"work"|"rest">("work");
  const [timeLeft, setTimeLeft] = useState(config.exercises[0].workSec);
  const [running, setRunning] = useState(false); const [done, setDone] = useState(false); const [showGif, setShowGif] = useState(false);
  const ex = config.exercises[exIdx];
  const nextEx = (() => { if (phase==="work") return null; const ni=(exIdx+1)%total; const nr=exIdx+1>=total?round+1:round; if(nr>totalR) return null; return config.exercises[ni]; })();
  useEffect(() => {
    if (!running||done) return;
    if (timeLeft<=0) {
      if (phase==="work") { setPhase("rest"); setTimeLeft(ex.restSec); }
      else { const ni=(exIdx+1)%total; const nr=exIdx+1>=total?round+1:round; if(nr>totalR&&ni===0){setDone(true);setRunning(false);return;} setExIdx(ni); if(ni===0)setRound(nr); setPhase("work"); setTimeLeft(config.exercises[ni].workSec); setShowGif(false); }
      return;
    }
    const t=setTimeout(()=>setTimeLeft(v=>v-1),1000); return ()=>clearTimeout(t);
  },[running,timeLeft,phase,exIdx,round,done,ex,config,total,totalR]);
  const urgent=timeLeft<=3&&!done; const phaseBg=done?"#ff4b3e":phase==="work"?"#54c17a":"#5c7a8a";
  return (
    <div style={{background:"var(--bg)",position:"fixed",inset:0,zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:24}}>
      <div style={{background:phaseBg,color:done?"#fff":phase==="work"?"#0c1a10":"#fff",fontSize:12,fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",padding:"6px 20px",borderRadius:20,marginBottom:14}}>{done?"Done!":phase==="work"?"Work":"Rest"}</div>
      {!done&&<div style={{fontSize:13,fontWeight:700,color:"var(--dim)",marginBottom:8,maxWidth:280}}>{ex.name}{config.mode==="circuit"&&<span style={{display:"block",fontSize:11,marginTop:4}}>Round {round}/{totalR}</span>}</div>}
      {ex.gifUrl&&!done&&(<><button onClick={()=>setShowGif(v=>!v)} style={{background:"none",border:"1px solid var(--line)",color:"var(--dim)",fontSize:12,fontWeight:700,padding:"5px 14px",borderRadius:20,cursor:"pointer",marginBottom:10,fontFamily:"inherit"}}>{showGif?"Hide GIF":"Show GIF"}</button>{showGif&&<div style={{width:"100%",maxWidth:200,borderRadius:10,overflow:"hidden",border:"1px solid var(--line)",marginBottom:10}}><img src={ex.gifUrl} alt={ex.name} style={{width:"100%",display:"block"}}/></div>}</>)}
      <div style={{fontSize:108,fontWeight:900,fontFamily:"monospace",lineHeight:1,color:urgent?"var(--accent)":"var(--text)",marginBottom:8,transition:"color .15s"}}>{done?"✓":fmtTime(timeLeft)}</div>
      {nextEx&&!done&&<div style={{marginBottom:16}}><div style={{fontSize:11,color:"var(--dim)",textTransform:"uppercase",letterSpacing:".1em",fontWeight:700,marginBottom:4}}>Next up</div><div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:6}}>{nextEx.name}</div>{nextEx.gifUrl&&<div style={{width:140,margin:"0 auto",borderRadius:8,overflow:"hidden",border:"1px solid var(--line)"}}><img src={nextEx.gifUrl} alt={nextEx.name} style={{width:"100%",display:"block"}}/></div>}</div>}
      <div style={{display:"flex",gap:12}}>
        {!done&&<button onClick={()=>setRunning(v=>!v)} style={{padding:"14px 32px",borderRadius:10,border:"none",fontSize:15,fontWeight:700,cursor:"pointer",background:"var(--accent)",color:"#fff",fontFamily:"inherit"}}>{running?"Pause":"Start"}</button>}
        <button onClick={onClose} style={{padding:"14px 32px",borderRadius:10,border:"none",fontSize:15,fontWeight:700,cursor:"pointer",background:"var(--line)",color:"var(--text)",fontFamily:"inherit"}}>{done?"Close":"Exit"}</button>
      </div>
    </div>
  );
}

function EmomTimer({ config, onClose }: { config: EmomConfig; onClose: () => void }) {
  const [exIdx,setExIdx]=useState(0); const [timeLeft,setTimeLeft]=useState(config.roundSec); const [running,setRunning]=useState(false); const [showGif,setShowGif]=useState(false);
  const ex=config.exercises[exIdx]; const nextEx=config.exercises[(exIdx+1)%config.exercises.length];
  useEffect(()=>{if(!running)return;if(timeLeft<=0){setExIdx(i=>(i+1)%config.exercises.length);setTimeLeft(config.roundSec);setShowGif(false);return;}const t=setTimeout(()=>setTimeLeft(v=>v-1),1000);return()=>clearTimeout(t);},[running,timeLeft,config]);
  const urgent=timeLeft<=5;
  return (
    <div style={{background:"var(--bg)",position:"fixed",inset:0,zIndex:999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:24}}>
      <div style={{background:"#2e8fff",color:"#fff",fontSize:12,fontWeight:800,letterSpacing:".14em",textTransform:"uppercase",padding:"6px 20px",borderRadius:20,marginBottom:14}}>EMOM</div>
      <div style={{fontSize:13,fontWeight:700,color:"var(--dim)",marginBottom:8}}>{ex.name}{ex.reps!=null&&<span style={{display:"block",fontSize:11,marginTop:2}}>×{ex.reps} reps</span>}</div>
      {ex.gifUrl&&(<><button onClick={()=>setShowGif(v=>!v)} style={{background:"none",border:"1px solid var(--line)",color:"var(--dim)",fontSize:12,fontWeight:700,padding:"5px 14px",borderRadius:20,cursor:"pointer",marginBottom:10,fontFamily:"inherit"}}>{showGif?"Hide GIF":"Show GIF"}</button>{showGif&&<div style={{width:"100%",maxWidth:200,borderRadius:10,overflow:"hidden",border:"1px solid var(--line)",marginBottom:10}}><img src={ex.gifUrl} alt={ex.name} style={{width:"100%",display:"block"}}/></div>}</>)}
      <div style={{fontSize:108,fontWeight:900,fontFamily:"monospace",lineHeight:1,color:urgent?"var(--accent)":"var(--text)",marginBottom:8}}>{fmtTime(timeLeft)}</div>
      <div style={{marginBottom:16}}><div style={{fontSize:11,color:"var(--dim)",textTransform:"uppercase",letterSpacing:".1em",fontWeight:700,marginBottom:4}}>Next</div><div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{nextEx.name}</div></div>
      <div style={{display:"flex",gap:12}}>
        <button onClick={()=>setRunning(v=>!v)} style={{padding:"14px 32px",borderRadius:10,border:"none",fontSize:15,fontWeight:700,cursor:"pointer",background:"var(--accent)",color:"#fff",fontFamily:"inherit"}}>{running?"Pause":"Start"}</button>
        <button onClick={onClose} style={{padding:"14px 32px",borderRadius:10,border:"none",fontSize:15,fontWeight:700,cursor:"pointer",background:"var(--line)",color:"var(--text)",fontFamily:"inherit"}}>Exit</button>
      </div>
    </div>
  );
}

// ─── Calendar popup ───────────────────────────────────────────────────────────

function CalendarPopup({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [calSessions, setCalSessions] = useState<CalSession[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [moving, setMoving] = useState<string | null>(null); // sessionId being moved
  const [dayAction, setDayAction] = useState<{ dateKey: string; existingSessionId: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/client/sessions")
      .then((r) => r.json())
      .then((d) => setCalSessions(d.sessions ?? []));
  }, []);

  const sessionMap = new Map<string, CalSession>();
  calSessions.forEach((s) => {
    if (s.date) {
      // Dates are stored as UTC midnight — use UTC date string as key
      const d = new Date(s.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
      sessionMap.set(key, s);
    }
  });

  function buildGrid(cursor: Date) {
    const year = cursor.getFullYear(); const month = cursor.getMonth();
    const first = new Date(year, month, 1); const startDay = first.getDay();
    const gridStart = new Date(year, month, 1 - startDay);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
      days.push({ date, inMonth: date.getMonth() === month, key });
    }
    return days;
  }

  const days = buildGrid(monthCursor);
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const _td = new Date();
  const today = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,"0")}-${String(_td.getDate()).padStart(2,"0")}`;

  async function handleMove(targetDateKey: string) {
    if (!moving) return;
    setLoading(true);
    await fetch("/api/client/move-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: moving, targetDate: targetDateKey }),
    });
    // Refresh sessions
    const d = await fetch("/api/client/sessions").then((r) => r.json());
    setCalSessions(d.sessions ?? []);
    setMoving(null);
    setDayAction(null);
    setLoading(false);
  }

  function handleDayTap(key: string) {
    const existing = sessionMap.get(key) ?? null;
    if (moving) {
      if (existing?.id === moving) { setMoving(null); return; } // tapped same session
      handleMove(key); // swap if occupied, move if empty
      return;
    }
    if (!existing) return;
    setDayAction({ dateKey: key, existingSessionId: existing.id });
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--panel)", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 420, padding: "20px 16px 40px", maxHeight: "85vh", overflowY: "auto" }}>

        {moving && (
          <div style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Tap a day to move the workout there</span>
            <button onClick={() => setMoving(null)} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>←</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{monthLabel}</span>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>→</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 10, color: "var(--dim)", fontWeight: 700 }}>{d}</div>)}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {days.map(({ date, inMonth, key }) => {
            const sess = sessionMap.get(key);
            const isToday = key === today;
            const isPast = key < today;
            const hasSess = !!sess;
            const isCurrentSession = sess?.id === sessionId;
            const outlineColor = hasSess ? (isPast ? "#ff4b3e" : "#54c17a") : "var(--line)";
            return (
              <div
                key={key}
                onClick={() => inMonth && handleDayTap(key)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  border: `1.5px solid ${hasSess ? outlineColor : "var(--line)"}`,
                  background: isCurrentSession ? "var(--steel)" : isToday ? "rgba(255,255,255,.06)" : "transparent",
                  opacity: inMonth ? 1 : 0.25,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: (hasSess || moving) && inMonth ? "pointer" : "default",
                  position: "relative",
                  padding: 2,
                }}
              >
                <span style={{ fontSize: 11, color: hasSess ? "var(--text)" : "var(--dim)", fontWeight: isToday ? 800 : 400 }}>{date.getDate()}</span>
                {hasSess && <div style={{ width: 5, height: 5, borderRadius: "50%", background: outlineColor, marginTop: 1 }} />}
              </div>
            );
          })}
        </div>

        {/* Day action popup */}
        {dayAction && (
          <div style={{ marginTop: 16, background: "var(--bg)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--line)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
              {calSessions.find((s) => s.id === dayAction.existingSessionId)?.dayLabel ?? "Session"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { window.location.href = `/client/session/${dayAction.existingSessionId!}`; }}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "var(--good)", color: "#0c1a10", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Open workout
              </button>
              <button
                onClick={() => { setMoving(dayAction.existingSessionId); setDayAction(null); }}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Move workout
              </button>
            </div>
            <button onClick={() => setDayAction(null)} style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", color: "var(--dim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Set row ──────────────────────────────────────────────────────────────────

function SetRow({ s, i, row, sessionId, unit, onPicker, onChange }: {
  s: SetState; i: number; row: Row; sessionId: string; unit: Units;
  onPicker: (field: "weight" | "reps") => void;
  onChange: (field: keyof SetState, value: any) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--dim)", fontFamily: "monospace", width: 18, flexShrink: 0 }}>{i + 1}</span>
        <button onClick={() => onPicker("weight")} style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)", fontSize: 20, fontWeight: 800, padding: "10px 0", textAlign: "center", cursor: "pointer", fontFamily: "monospace" }}>
          {s.weight % 1 === 0 ? s.weight : s.weight.toFixed(1)}
        </button>
        <span style={{ fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>{unit.toLowerCase()}</span>
        <span style={{ fontSize: 14, color: "var(--dim)", flexShrink: 0 }}>×</span>
        <button onClick={() => onPicker("reps")} style={{ width: 56, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)", fontSize: 20, fontWeight: 800, padding: "10px 0", textAlign: "center", cursor: "pointer", fontFamily: "monospace" }}>
          {s.reps}
        </button>
        {/* Square checkmark — grey ✓ idle, green ✓ done */}
        <div style={{ width: 42, height: 42, borderRadius: 8, border: s.done ? "none" : "2px solid var(--line)", background: s.done ? "var(--good)" : "transparent", color: s.done ? "#0c1a10" : "var(--line)", fontSize: 22, fontWeight: 900, flexShrink: 0, transition: "all .2s", display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
      </div>
      {/* Note field */}
      <input
        type="text"
        placeholder="Note for this set..."
        value={s.note}
        onChange={(e) => onChange("note", e.target.value)}
        onBlur={(e) => {
          if (s.done && e.target.value !== s.note) {
            // re-save with updated note
            fetch("/api/client/log-set", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionExerciseId: row.id,
                sessionId,
                exerciseId: row.exerciseId,
                setIndex: i,
                weight: s.weight || null,
                reps: s.reps,
                notes: e.target.value || null,
              }),
            });
          }
        }}
        style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", color: "var(--dim)", fontSize: 12, padding: "4px 2px", fontFamily: "inherit", outline: "none" }}
      />
    </div>
  );
}

// ─── Exercise card (straight sets) ───────────────────────────────────────────

function ExerciseCard({ row, sessionId, defaultUnit, defaultOpen = true }: {
  row: Row; sessionId: string; defaultUnit: Units; defaultOpen?: boolean;
}) {
  const numSets = row.sets || 1;
  const defaultReps = row.reps ?? 10;
  const defaultWeight = row.loadValue ?? 0;
  const [open, setOpen] = useState(defaultOpen);
  const [sets, setSets] = useState<SetState[]>(
    Array.from({ length: numSets }, () => ({ weight: defaultWeight, reps: defaultReps, done: false, note: "" }))
  );
  const [unit, setUnit] = useState<Units>(row.loadUnit ?? defaultUnit);
  const [picker, setPicker] = useState<{ setIdx: number; field: "weight" | "reps" } | null>(null);
  const [gifOpen, setGifOpen] = useState(false);

  const doneSets = sets.filter((s) => s.done).length;
  const allDone = doneSets === numSets;
  const target = formatTarget(row);
  const ytUrl = row.exercise.youtubeUrl ? ytLink(row.exercise.youtubeUrl) : null;

  async function doLog(idx: number, newSets: SetState[]) {
    const s = newSets[idx];
    const weight = s.weight || (row.loadValue ?? null);
    try {
      const res = await fetch("/api/client/log-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionExerciseId: row.id,
          sessionId,
          exerciseId: row.exerciseId,
          setIndex: idx,
          weight,
          reps: s.reps,
          notes: s.note || null,
        }),
      });
      const data = await res.json();
      setSets((prev) => prev.map((ss, i) => i === idx ? { ...ss, done: true, isPr: data.isPr } : ss));
    } catch {
      setSets((prev) => prev.map((ss, i) => i === idx ? { ...ss, done: true } : ss));
    }
  }

  function handlePickerConfirm(v: number) {
    const field = picker!.field;
    const idx = picker!.setIdx;
    setSets((prev) => {
      const next = prev.map((ss, i) => i === idx ? { ...ss, [field]: v } : ss);
      if (field === "reps") doLog(idx, next);
      return next;
    });
  }

  return (
    <>
      {gifOpen && row.exercise.gifUrl && <GifOverlay url={row.exercise.gifUrl} name={row.exercise.name} onClose={() => setGifOpen(false)} />}
      {picker && (
        <DrumPicker
          label={picker.field === "weight" ? `Weight (${unit.toLowerCase()})` : "Reps"}
          values={picker.field === "weight" ? makeWeightValues(sets[picker.setIdx].weight) : makeRepValues(sets[picker.setIdx].reps)}
          initial={picker.field === "weight" ? sets[picker.setIdx].weight : sets[picker.setIdx].reps}
          onConfirm={handlePickerConfirm}
          onClose={() => setPicker(null)}
        />
      )}

      <div style={{ background: "var(--panel)", border: `1px solid ${allDone ? "var(--good)" : "var(--line)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden", transition: "border-color .2s" }}>
        <div onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", userSelect: "none" }}>
          <div onClick={(e) => { if (row.exercise.gifUrl) { e.stopPropagation(); setGifOpen(true); } }}
            style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--dim)", cursor: row.exercise.gifUrl ? "zoom-in" : "default" }}>
            {row.exercise.gifUrl ? <img src={row.exercise.gifUrl} alt={row.exercise.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "💪"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: allDone ? "var(--dim)" : "var(--text)" }}>{row.exercise.name}</div>
            {target && <div style={{ fontSize: 11, color: "var(--dim)", fontFamily: "monospace", marginTop: 1 }}>{target}</div>}
          </div>
          <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: allDone ? "#0c1a10" : doneSets > 0 ? "var(--text)" : "var(--dim)", border: `1px solid ${allDone ? "var(--good)" : doneSets > 0 ? "var(--steel)" : "var(--line)"}`, background: allDone ? "var(--good)" : "transparent", padding: "3px 7px", borderRadius: 5, flexShrink: 0, transition: "all .2s" }}>
            {doneSets}/{numSets}
          </div>
          <div style={{ color: "var(--dim)", fontSize: 11, transition: "transform .25s", transform: open ? "rotate(180deg)" : "none" }}>▼</div>
        </div>

        {open && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "10px 14px" }}>
            {sets.some((s) => s.isPr) && <div style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 700, border: "1px solid var(--accent-dim)", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginBottom: 6 }}>PR 🏆</div>}
            {ytUrl && <a href={ytUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", fontWeight: 700, textDecoration: "none", background: "var(--blue)", padding: "6px 10px", borderRadius: 8, marginBottom: 8 }}>▶ Watch demo</a>}
            {row.coachNote && <div style={{ fontSize: 12, color: "var(--dim)", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>📋 {row.coachNote}</div>}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(["KG", "LB"] as Units[]).map((u) => (
                <button key={u} onClick={() => setUnit(u)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--line)", background: unit === u ? "var(--steel)" : "transparent", color: unit === u ? "#fff" : "var(--dim)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{u}</button>
              ))}
            </div>
            {sets.map((s, i) => (
              <SetRow
                key={i} s={s} i={i} row={row} sessionId={sessionId} unit={unit}
                onPicker={(field) => setPicker({ setIdx: i, field })}
                onChange={(field, value) => setSets((prev) => prev.map((ss, idx) => idx === i ? { ...ss, [field]: value } : ss))}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Timed exercise row (circuit/interval/emom — info only) ───────────────────

function TimedExerciseRow({ row, isFirst, onStartTimer, defaultOpen = true }: {
  row: Row; isFirst: boolean; onStartTimer?: () => void; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [gifOpen, setGifOpen] = useState(false);
  const target = formatTarget(row);
  const ytUrl = row.exercise.youtubeUrl ? ytLink(row.exercise.youtubeUrl) : null;
  return (
    <>
      {gifOpen && row.exercise.gifUrl && <GifOverlay url={row.exercise.gifUrl} name={row.exercise.name} onClose={() => setGifOpen(false)} />}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 6, overflow: "hidden" }}>
        <div onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", userSelect: "none" }}>
          <div onClick={(e) => { if (row.exercise.gifUrl) { e.stopPropagation(); setGifOpen(true); } }}
            style={{ width: 44, height: 44, borderRadius: 7, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--dim)", cursor: row.exercise.gifUrl ? "zoom-in" : "default" }}>
            {row.exercise.gifUrl ? <img src={row.exercise.gifUrl} alt={row.exercise.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "💪"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{row.exercise.name}</div>
            {target && <div style={{ fontSize: 11, color: "var(--dim)", fontFamily: "monospace", marginTop: 1 }}>{target}</div>}
          </div>
          <div style={{ color: "var(--dim)", fontSize: 11, transition: "transform .25s", transform: open ? "rotate(180deg)" : "none" }}>▼</div>
        </div>
        {open && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "10px 14px" }}>
            {ytUrl && <a href={ytUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", fontWeight: 700, textDecoration: "none", background: "var(--blue)", padding: "6px 10px", borderRadius: 8, marginBottom: 8 }}>▶ Watch demo</a>}
            {row.coachNote && <div style={{ fontSize: 12, color: "var(--dim)", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>📋 {row.coachNote}</div>}
            {row.exercise.cues && <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8, lineHeight: 1.5 }}>{row.exercise.cues}</div>}
            {isFirst && onStartTimer && (
              <button onClick={onStartTimer} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit" }}>▶ Start Timer</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Group card (superset / circuit / interval / emom) ────────────────────────

function GroupCard({ label, color, children, openKey, activeKey, onToggle, previewRows }: {
  label: string; color: string | null; children: React.ReactNode;
  openKey: string; activeKey: string | null; onToggle: (key: string) => void;
  previewRows?: Row[];
}) {
  const open = activeKey === openKey;
  return (
    <div style={{ border: `2px solid ${color ?? "var(--line)"}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => onToggle(openKey)} style={{ cursor: "pointer", userSelect: "none", background: "var(--panel)" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
          {color && <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />}
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--dim)", flex: 1 }}>{label}</span>
          <div style={{ color: "var(--dim)", fontSize: 11, transition: "transform .25s", transform: open ? "rotate(180deg)" : "none" }}>▼</div>
        </div>
        {/* Collapsed preview — GIF + name + sets×reps per exercise */}
        {!open && previewRows && previewRows.length > 0 && (
          <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {previewRows.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--dim)" }}>
                  {r.exercise.gifUrl ? <img src={r.exercise.gifUrl} alt={r.exercise.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "💪"}
                </div>
                <span style={{ flex: 1, fontSize: 12, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.exercise.name}</span>
                <span style={{ fontSize: 11, color: "var(--dim)", fontFamily: "monospace", flexShrink: 0 }}>
                  {r.sets && r.reps ? `${r.sets}×${r.reps}` : r.reps ? `×${r.reps}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {open && <div style={{ padding: "10px 10px 4px" }}>{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TodayWorkout({ session, defaultUnit }: { session: SessionWithRows; defaultUnit: Units }) {
  const rows = [...session.sessionExercises].sort((a, b) => a.order - b.order);
  const blocks = buildBlocks(rows);
  const [timer, setTimer] = useState<TimerConfig | null>(null);
  const [emomTimer, setEmomTimer] = useState<EmomConfig | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  function toggleGroup(key: string) { setActiveGroup((v) => v === key ? null : key); }

  function makeTimerForBlock(block: Block & { kind: "circuit" | "interval" }): TimerConfig {
    return {
      exercises: block.rows.map((r) => { const res = resolveGroupTarget(r.target, block.rows[0].target); return { name: r.exercise.name, gifUrl: r.exercise.gifUrl ?? null, workSec: res.kind === "interval" ? res.workSec : 40, restSec: res.kind === "interval" ? res.restSec : 20 }; }),
      rounds: block.kind === "circuit" ? block.rounds : 1,
      mode: block.kind === "circuit" ? "circuit" : "interval",
    };
  }
  function makeEmomConfig(block: Block & { kind: "emom" }): EmomConfig {
    return { roundSec: block.roundSec, exercises: block.rows.map((r) => { const p = parseIntervalTarget(r.target); return { name: r.exercise.name, gifUrl: r.exercise.gifUrl ?? null, reps: p.kind === "emom" ? p.reps : null }; }) };
  }

  const date = session.date ? new Date(session.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }).toUpperCase() : "";

  return (
    <>
      <style>{`
        :root{--bg:#14161a;--panel:#1c1f24;--line:#2a2e35;--text:#edeae4;--dim:#8a8f98;--accent:#ff4b3e;--accent-dim:#5c1f19;--steel:#5c7a8a;--good:#54c17a;--blue:#2e8fff;}
        body{background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
        input[type=number]{-moz-appearance:textfield;}
      `}</style>

      {timer && <IntervalTimer config={timer} onClose={() => setTimer(null)} />}
      {emomTimer && <EmomTimer config={emomTimer} onClose={() => setEmomTimer(null)} />}
      {calOpen && <CalendarPopup sessionId={session.id} onClose={() => setCalOpen(false)} />}

      <header style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--steel)", fontWeight: 600 }}>{date}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", color: "var(--text)", margin: 0 }}>{session.dayLabel}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setCalOpen(true)} style={{ width: 38, height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Calendar">📅</button>
            <a href="/client/dashboard" style={{ width: 38, height: 38, borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} title="Overview">📊</a>
          </div>
        </div>
      </header>

      <main style={{ padding: 12, paddingBottom: 100 }}>
        {blocks.map((block, bi) => {
          if (block.kind === "single") {
            return <ExerciseCard key={block.row.id} row={block.row} sessionId={session.id} defaultUnit={defaultUnit} />;
          }

          if (block.kind === "superset") {
            const groupKey = block.rows[0].groupId!;
            return (
              <GroupCard key={groupKey} label="Superset" color={block.color} openKey={groupKey} activeKey={activeGroup} onToggle={toggleGroup} previewRows={block.rows}>
                {block.rows.map((r) => <ExerciseCard key={r.id} row={r} sessionId={session.id} defaultUnit={defaultUnit} defaultOpen={true} />)}
              </GroupCard>
            );
          }

          if (block.kind === "circuit") {
            const groupKey = block.rows[0].groupId!;
            const cfg = makeTimerForBlock(block);
            return (
              <GroupCard key={groupKey} label={`Circuit · ${block.rounds} rounds`} color={block.color} openKey={groupKey} activeKey={activeGroup} onToggle={toggleGroup} previewRows={block.rows}>
                {block.rows.map((r, ri) => <TimedExerciseRow key={r.id} row={r} isFirst={ri === 0} onStartTimer={ri === 0 ? () => setTimer(cfg) : undefined} defaultOpen={true} />)}
                <div style={{ marginTop: 6, marginBottom: 6, padding: "8px 10px", background: "rgba(255,255,255,.03)", borderRadius: 8, border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".08em" }}>Session note</div>
                  <textarea placeholder="How did it feel?" rows={2} style={{ width: "100%", background: "transparent", border: "none", color: "var(--text)", fontSize: 12, resize: "none", fontFamily: "inherit", outline: "none" }} />
                </div>
              </GroupCard>
            );
          }

          if (block.kind === "interval") {
            const groupKey = block.rows[0].groupId!;
            const cfg = makeTimerForBlock(block);
            return (
              <GroupCard key={groupKey} label="Interval" color={block.color} openKey={groupKey} activeKey={activeGroup} onToggle={toggleGroup} previewRows={block.rows}>
                {block.rows.map((r, ri) => <TimedExerciseRow key={r.id} row={r} isFirst={ri === 0} onStartTimer={ri === 0 ? () => setTimer(cfg) : undefined} defaultOpen={true} />)}
              </GroupCard>
            );
          }

          if (block.kind === "emom") {
            const groupKey = block.rows[0].groupId!;
            const cfg = makeEmomConfig(block);
            return (
              <GroupCard key={groupKey} label={`EMOM · ${block.roundSec}s`} color={block.color} openKey={groupKey} activeKey={activeGroup} onToggle={toggleGroup} previewRows={block.rows}>
                {block.rows.map((r, ri) => <TimedExerciseRow key={r.id} row={r} isFirst={ri === 0} onStartTimer={ri === 0 ? () => setEmomTimer(cfg) : undefined} defaultOpen={true} />)}
              </GroupCard>
            );
          }

          return null;
        })}
      </main>
    </>
  );
}
