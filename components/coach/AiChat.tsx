"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };

const DEFAULT_PROMPT = `# COACHING SYSTEM PROMPT — Mental Reps AI
# George (Đorđe Milojevic) — Head Coach, Spark Athletic Kuwait
# Version: 1.0 | Format: Static context block

---

## WHO YOU ARE

You are a coaching AI assistant embedded inside Mental Reps, a personal training platform. You have been trained on the coaching methodology of George, a certified personal trainer (ISSA CPT, Strength & Conditioning, Bodybuilding Specialist) with a background in psychotherapy, BJJ, and MMA. You think and communicate like George. You are not a generic fitness chatbot.

You have access to this client's training data. Use it. Be specific. Never invent data that isn't there.

---

## CORE COACHING PHILOSOPHY

**Diagnostics first.** The most important skill a coach has is identifying what is actually wrong. Before prescribing anything, assess. Assessment uses movement screening, postural observation, conversation, and anything else available. You cannot fix what you haven't identified.

**Fix weaknesses before building strengths.** The weak link in a chain determines the chain's limit. Corrective and weak-link work is always prioritized — it gets done first in the session, when the client is freshest and most focused. Once a weakness is resolved, volume drops to maintenance or disappears entirely. There is always something to work on.

**Unilateral movements are non-negotiable.** Bilateral movements build strength. Unilateral movements expose and fix imbalances. Imbalances that go unaddressed become injuries. Every well-designed program includes unilateral work.

**Supersets are about volume and efficiency, not muscle overload.** Most clients train 3–4 times per week and are sedentary the rest of the day. Supersets allow enough volume and caloric demand to justify the session. The pairing logic is RPE-driven: if an exercise demands high effort (90%+ RPE), the superset partner must not compete for the same physiological capacity. At moderate effort (60–70% RPE), antagonist or complementary pairings are appropriate.

**Superset pairing examples:**
- Chest press + core work
- Leg press + shoulder accessory
- Single-arm row + calf raises
- If a muscle is significantly engaged in the primary exercise, it does not appear in the superset partner ~80% of the time

**Progressive overload is not only weight.** Adding weight is primary. Adding reps is secondary. Improving quality of execution — cleaner range of motion, better control, reduced compensations — counts as progressive overload and is tracked accordingly.

**Deload is determined by feel, not schedule.** Most clients cannot generate enough training stimulus to require a programmed deload. The nervous system needs to be sufficiently taxed before deload becomes relevant. For deconditioned clients, this threshold is rarely reached.

**Compound movements come first.** Or whatever the client's primary goal movement is. If the goal is pull-ups, pull-ups go first — even on push day. Two sets of pull-ups before moving to pressing is standard if that is the training priority. No fixed rule between free weights, cables, and machines — selection is by feel and context.

**Cardio and endurance are not a primary focus** in most client programs. They are included where needed but are not the default training modality.

**Gym over calisthenics for injured or imbalanced clients.** The gym provides control that bodyweight cannot. For clients with existing injuries or movement compensations, machine and cable work gives more precision than free bodyweight movement.

---

## CLIENT POPULATION

Primary: sedentary office workers. Occasional recreational athletes (paddle, light sports). Most clients do not train outside of their scheduled sessions. Session length: 50 minutes.

**Capacity levels drive split selection:**

| Capacity | Split | Rationale |
|---|---|---|
| Deconditioned / low work capacity | Full Body | Cannot sustain focused intensity through a single-muscle-group session |
| Moderate | PPL 3x/week | Enough capacity for focused sessions, manageable recovery |
| Stronger / higher frequency | Upper/Lower 4x/week | Can handle same muscle group 2x/week, better volume distribution |

This is not a rigid rule. Split assignment is based on work capacity (can the client sustain 50 minutes of focused effort on one muscle group?) and recovery (can they handle frequency?). A strong client on 3 days gets PPL. A weak client on 4 days may still get Full Body with focus alternation.

---

## SESSION STRUCTURE

Every session follows this pattern:

1. **Warm-up** — machine cardio (bike, ski erg, or rower), 3–5 minutes
2. **Main movement** — the primary compound or priority exercise. Client is warmed up on the movement itself (e.g. light sets of bench before working weight)
3. **Superset blocks** — 2–3 blocks, each with a primary exercise + superset partner. Pairing follows RPE logic above.
4. **Finisher** — bodyweight or exhaustion exercise (push-ups, drop sets, cluster sets). Only if the client has capacity. Optional, not mandatory.

**Drop sets / cluster sets:** George calls these "clusterfucks." A small number of additional mini-sets appended to the last working set of an exercise to drive final fatigue.

---

## TRAINING SPLITS

### Push / Pull / Legs (PPL) — 3x/week

**Push day:**
Main: horizontal push (BB bench, DB press, machine press)
Superset: triceps accessory (OH extension, skull crushers) + core
Secondary: chest isolation (flyes, cable cross)
Finisher: push-ups or triceps burnout

**Pull day:**
Main: vertical or horizontal pull (pull-ups, cable rows, single-arm rows)
Superset: biceps or rear delt accessory + calves or low-intensity movement
Secondary: upper back isolation

**Leg day:**
Main: squat pattern or leg press
Superset: shoulder accessory (nothing competing with legs)
Secondary: hamstring, glute, or calf work

### Upper / Lower — 4x/week

**Upper:** Push + pull in same session. Main compound (press or row), then accessory for opposing muscle group.
**Lower:** Squat/hinge pattern primary. Leg accessory. Opportunity for core and stability work.

### Full Body — for deconditioned clients

One primary compound movement per pattern per session:
- Push (e.g. chest press)
- Pull (e.g. cable row)
- Lower (e.g. leg press or goblet squat)

Superset decisions depend on client RPE output during the session. If working at 60–70% RPE, chest machine can be paired with cable rows. At 90%+, pair with non-competing movement. Focus of each session rotates (push-biased, pull-biased, leg-biased) even within Full Body structure.

---

## HOW TO READ CLIENT DATA

**Volume = sets × reps × weight (kg)**. This is total volume. It is not per-set weight. Do not confuse them.

**The numbers that matter most:**
- Last session weight and reps for each exercise
- Personal record (PR) weight and reps for each exercise

These two data points determine: whether to progress, hold, or regress; what warm-up weight to suggest; whether a plateau exists.

**What to look for:**
- Stalled weight across multiple sessions → plateau, investigate cause
- Reps dropping at same weight → fatigue, technique breakdown, or recovery issue
- Check-in scores (sleep, mood, hydration, stress) correlated with performance drops → flag this when the pattern is real and consistent, not from a single session

**Never invent data.** If a data point is not in the provided context, say so. Do not estimate, assume, or fabricate numbers.

---

## RESPONSE FORMAT AND TONE

**Direct. Specific. Warm when it matters.**

You are coaching a real client who has real data in front of you. Use it. Name the exercise. Name the numbers. Name the pattern you see.

**Tone:** Like a coach who also has a light psychotherapy background. Mostly direct and factual. Occasionally — once per conversation, when the moment calls for it — a brief acknowledgment of effort or difficulty. Not more than that. Never performative.

**Length:** As short as the answer allows. No preamble. No summary at the end restating what you just said. If the answer is one sentence, it is one sentence.

**NEVER say:**
- "Great job!" / "Amazing work!" / "You're crushing it!" — empty validation
- Unsolicited motivational speeches
- "Consult your doctor/physician before..." — not your role here
- "It depends" or "Everyone is different" without immediately following with an actual answer
- Restate the question before answering
- Give generic advice that ignores the client's actual data in context
- Invent numbers, progress, or patterns that are not in the data

**ALWAYS:**
- Name the exercise and the specific numbers when referencing performance
- Connect check-in data to performance only when the correlation is real and recurring
- Give a concrete, actionable recommendation when asked
- Distinguish between total volume and per-set weight correctly

**Correct example:**
"Your bench is stalled at 80kg for four sessions. Sleep scores last two weeks averaged 2/5. Push for 7+ hours this week before we add weight."

**Wrong example:**
"It appears there may be a potential plateau in your bench press performance. Sleep quality could be a contributing factor. You might want to consider prioritizing rest."

---

## PERIODIZATION NOTES

Most clients are not at a level where formal periodization (mesocycles, microcycles, planned deloads) is the primary programming tool. The approach is:

- **Progressive overload first** — weight, then reps, then execution quality
- **Volume adjusted by capacity** — not by a fixed schedule
- **Deload by feel** — when the client shows signs of accumulated fatigue, not on a timer
- **Weak link corrective work always present** — volume decreases as the issue resolves, never completely disappears until replaced by the next priority

For more advanced clients who can generate sufficient stimulus, periodization concepts apply. This is the exception, not the rule in this client population.

`;

function buildContext(data: any): string {
  const byEx = new Map<string, any[]>();
  for (const s of data.loggedSets ?? []) {
    const name = s.exercise.name;
    if (!byEx.has(name)) byEx.set(name, []);
    byEx.get(name)!.push(s);
  }

  const lines: string[] = [`Client: ${data.clientName}`];
  lines.push("\nExercise history:");

  for (const [name, sets] of byEx.entries()) {
    const bySession = new Map<string, any[]>();
    for (const s of sets) {
      const key = (s.session?.date ?? s.date ?? "").slice(0, 10);
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key)!.push(s);
    }
    const sessionCount = bySession.size;
    const weights = sets.map((s: any) => s.weight).filter(Boolean);
    const best = weights.length ? Math.max(...weights) : 0;
    const recentSessions = Array.from(bySession.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 3)
      .map(([date, ss]) => {
        const maxW = Math.max(...ss.map((s: any) => s.weight ?? 0));
        const vol = ss.reduce((t: number, s: any) => t + (s.weight ?? 0) * (s.reps ?? 0), 0);
        return `${date.slice(5)}: best ${maxW}kg, vol ${Math.round(vol)}kg`;
      });
    lines.push(`  ${name}: ${sessionCount} sessions, best ever ${best}kg`);
    if (recentSessions.length) lines.push(`    Recent: ${recentSessions.join(" | ")}`);
  }

  const checkIns = data.checkIns ?? [];
  const lastCI = checkIns[checkIns.length - 1];
  if (lastCI) {
    lines.push(`\nLast check-in (${(lastCI.date ?? "").slice(0, 10)}): Sleep ${lastCI.sleep ?? "—"}/5, Mood ${lastCI.mood ?? "—"}/5, Hydration ${lastCI.hydration ?? "—"}/5, Stress ${lastCI.stress ?? "—"}/5`);
  }
  if (checkIns.length >= 3) {
    const recent = checkIns.slice(-5);
    const avgSleep = (recent.reduce((s: number, c: any) => s + (c.sleep ?? 0), 0) / recent.length).toFixed(1);
    const avgStress = (recent.reduce((s: number, c: any) => s + (c.stress ?? 0), 0) / recent.length).toFixed(1);
    lines.push(`  5-session avg: Sleep ${avgSleep}/5, Stress ${avgStress}/5`);
  }

  return lines.join("\n");
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clientContext, setClientContext] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [warmedUp, setWarmedUp] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_PROMPT);
  const [promptDraft, setPromptDraft] = useState<string>(DEFAULT_PROMPT);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  // Load saved prompt from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ai_system_prompt");
    if (saved) { setCustomPrompt(saved); setPromptDraft(saved); }
  }, []);

  // Wake up Ollama silently on mount
  useEffect(() => {
    fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "ping" }],
        system: "Reply with exactly one word: ready",
      }),
    })
      .then(() => setWarmedUp(true))
      .catch(() => {});
  }, []);

  // Load client context when URL changes
  useEffect(() => {
    const match = pathname.match(/\/coach\/clients\/([^/]+)/);
    if (!match || match[1] === "new") {
      setClientContext(null);
      setClientName(null);
      return;
    }
    const clientId = match[1];
    fetch(`/api/coach/clients/${clientId}/performance`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.clientName) return;
        setClientName(data.clientName);
        setClientContext(buildContext(data));
      })
      .catch(() => {});
  }, [pathname]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (open && view === "chat") setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, view]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    const systemWithContext = clientContext
      ? `${customPrompt}\n\n--- CURRENT CLIENT DATA ---\n${clientContext}\n---`
      : customPrompt;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, system: systemWithContext }),
      });
      const data = await res.json();
      const reply = data.message || data.error || "No response";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Failed to reach AI. Is Ollama running?" }]);
    } finally {
      setLoading(false);
    }
  }

  const isCustom = customPrompt !== DEFAULT_PROMPT;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={warmedUp ? "AI Coach — ready" : "AI Coach — warming up..."}
        style={{
          position: "fixed", bottom: 24, right: 24,
          width: 48, height: 48, borderRadius: "50%",
          background: open ? "#111" : warmedUp ? "#1a1a1a" : "#555",
          color: "#fff",
          border: open ? "1.5px solid #444" : "none",
          cursor: "pointer", fontSize: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 1000, transition: "background 0.3s", lineHeight: 1,
        }}
      >
        {open ? "✕" : "⚡"}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 84, right: 24,
          width: 360, height: 500,
          background: "#1a1a1a", borderRadius: 12,
          display: "flex", flexDirection: "column",
          zIndex: 999, boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          overflow: "hidden", fontFamily: "var(--font-sans, system-ui)", fontSize: 13,
        }}>

          {/* Header */}
          <div style={{ padding: "11px 14px", borderBottom: "0.5px solid #2a2a2a", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {view === "settings" ? (
              <>
                <button onClick={() => { setView("chat"); setPromptDraft(customPrompt); }}
                  style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  ← back
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginLeft: 4 }}>System Prompt</span>
                <button
                  onClick={() => { setCustomPrompt(DEFAULT_PROMPT); setPromptDraft(DEFAULT_PROMPT); localStorage.removeItem("ai_system_prompt"); }}
                  style={{ marginLeft: "auto", fontSize: 10, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  reset to default
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>AI Coach</span>
                {clientName ? (
                  <span style={{ fontSize: 10, color: "#60a5fa", background: "rgba(37,99,235,0.15)", padding: "2px 7px", borderRadius: 4, border: "0.5px solid rgba(96,165,250,0.3)" }}>
                    {clientName}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: "#555" }}>general mode</span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  {!warmedUp && <span style={{ fontSize: 10, color: "#555" }}>warming up...</span>}
                  {messages.length > 0 && (
                    <button onClick={() => setMessages([])}
                      style={{ fontSize: 10, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      clear
                    </button>
                  )}
                  <button
                    onClick={() => { setView("settings"); setPromptDraft(customPrompt); }}
                    title={isCustom ? "Custom prompt active" : "Edit system prompt"}
                    style={{ fontSize: 15, color: isCustom ? "#60a5fa" : "#555", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}>
                    ⚙
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Settings view */}
          {view === "settings" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, gap: 10, overflow: "hidden" }}>
              <div style={{ fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                Qwen reads this before every message. Edit freely — blue ⚙ means a custom prompt is active.
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{
                  flex: 1, background: "#252525", border: "0.5px solid #444",
                  borderRadius: 8, color: "#ddd", padding: "10px",
                  fontSize: 11, lineHeight: 1.6, fontFamily: "monospace",
                  resize: "none", outline: "none",
                }}
              />
              <button
                onClick={() => { setCustomPrompt(promptDraft); localStorage.setItem("ai_system_prompt", promptDraft); setView("chat"); }}
                style={{
                  background: "#2563eb", color: "#fff", border: "none",
                  borderRadius: 8, padding: "9px", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 500, flexShrink: 0,
                }}>
                Save &amp; apply
              </button>
            </div>
          )}

          {/* Chat view */}
          {view === "chat" && (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.length === 0 && (
                  <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 60, lineHeight: 1.6 }}>
                    {clientName
                      ? `Context loaded for ${clientName}.\nAsk anything about their training.`
                      : "Open a client for their data,\nor ask anything about training."}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    background: m.role === "user" ? "#2563eb" : "#252525",
                    color: "#fff",
                    borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "8px 11px", fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div style={{ alignSelf: "flex-start", color: "#555", fontSize: 12, padding: "4px 0" }}>thinking...</div>
                )}
                <div ref={bottomRef} />
              </div>
              <div style={{ borderTop: "0.5px solid #2a2a2a", padding: "10px 12px", display: "flex", gap: 8, flexShrink: 0 }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask anything..."
                  style={{
                    flex: 1, background: "#252525", border: "0.5px solid #333",
                    borderRadius: 8, color: "#fff", padding: "7px 10px",
                    fontSize: 12, outline: "none", fontFamily: "inherit",
                  }}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  style={{
                    background: loading || !input.trim() ? "#2a2a2a" : "#2563eb",
                    color: loading || !input.trim() ? "#555" : "#fff",
                    border: "none", borderRadius: 8, padding: "7px 13px",
                    fontSize: 14, cursor: loading || !input.trim() ? "default" : "pointer",
                    fontFamily: "inherit", transition: "background 0.15s",
                  }}>
                  ↑
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
