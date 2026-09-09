"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are an AI coaching assistant for Mental Reps, a strength coaching platform.
You assist coaches with client analysis, program design, and training questions.

Your personality:
- Direct and concise, like an experienced strength and conditioning coach
- Reference specific numbers when client data is available
- Never say "data suggests" — say what you see
- Give one concrete actionable recommendation when asked
- You understand progressive overload, periodization, RPE, volume landmarks, and body composition
- When check-in scores are low (sleep <3, stress >3), factor that into your recommendations

When client data is provided below, use it to give specific answers about that client.
When no client is open, act as a general strength and conditioning assistant.`;

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
  const [customPrompt, setCustomPrompt] = useState<string>(SYSTEM_PROMPT);
  const [promptDraft, setPromptDraft] = useState<string>(SYSTEM_PROMPT);
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

  // Load client context when URL changes to a client page
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

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

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

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={warmedUp ? "AI Coach — ready" : "AI Coach — warming up..."}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: open ? "#111" : warmedUp ? "#1a1a1a" : "#555",
          color: "#fff",
          border: open ? "1.5px solid #444" : "none",
          cursor: "pointer",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          zIndex: 1000,
          transition: "background 0.3s",
          lineHeight: 1,
        }}
      >
        {open ? "✕" : "⚡"}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 84,
            right: 24,
            width: 360,
            height: 500,
            background: "#1a1a1a",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            zIndex: 999,
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            overflow: "hidden",
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 13,
          }}
        >
          {/* Header */}
          <div style={{ padding: "11px 14px", borderBottom: "0.5px solid #2a2a2a", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {view === "settings" ? (
              <>
                <button onClick={() => { setView("chat"); setPromptDraft(customPrompt); }} style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← back</button>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginLeft: 4 }}>System Prompt</span>
                <button
                  onClick={() => { setCustomPrompt(SYSTEM_PROMPT); setPromptDraft(SYSTEM_PROMPT); localStorage.removeItem("ai_system_prompt"); }}
                  style={{ marginLeft: "auto", fontSize: 10, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >reset</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>AI Coach</span>
                {clientName ? (
                  <span style={{ fontSize: 10, color: "#60a5fa", background: "rgba(37,99,235,0.15)", padding: "2px 7px", borderRadius: 4, border: "0.5px solid rgba(96,165,250,0.3)" }}>{clientName}</span>
                ) : (
                  <span style={{ fontSize: 10, color: "#555" }}>general mode</span>
                )}
                {!warmedUp && <span style={{ fontSize: 10, color: "#555", marginLeft: "auto" }}>warming up...</span>}
                <div style={{ marginLeft: warmedUp ? "auto" : 0, display: "flex", gap: 8 }}>
                  {messages.length > 0 && (
                    <button onClick={() => setMessages([])} style={{ fontSize: 10, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>clear</button>
                  )}
                  <button
                    onClick={() => { setView("settings"); setPromptDraft(customPrompt); }}
                    title="Edit system prompt"
                    style={{ fontSize: 14, color: customPrompt !== SYSTEM_PROMPT ? "#60a5fa" : "#555", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
                  >⚙</button>
                </div>
              </>
            )}
          </div>

          {/* Settings view */}
          {view === "settings" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, gap: 10, overflow: "hidden" }}>
              <div style={{ fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                This is what Qwen reads before every message. Edit to change how it thinks, responds, and what it prioritises. Blue ⚙ = custom prompt active.
              </div>
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                style={{
                  flex: 1,
                  background: "#252525",
                  border: "0.5px solid #444",
                  borderRadius: 8,
                  color: "#ddd",
                  padding: "10px",
                  fontSize: 11,
                  lineHeight: 1.6,
                  fontFamily: "monospace",
                  resize: "none",
                  outline: "none",
                }}
              />
              <button
                onClick={() => {
                  setCustomPrompt(promptDraft);
                  localStorage.setItem("ai_system_prompt", promptDraft);
                  setView("chat");
                }}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                Save &amp; apply
              </button>
            </div>
          )}

          {/* Chat view */}
          {view === "chat" && (<>
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  color: "#444",
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 60,
                  lineHeight: 1.6,
                }}
              >
                {clientName
                  ? `Context loaded for ${clientName}.\nAsk anything about their training.`
                  : "Open a client for their data,\nor ask anything about training."}
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: m.role === "user" ? "#2563eb" : "#252525",
                  color: "#fff",
                  borderRadius:
                    m.role === "user"
                      ? "12px 12px 2px 12px"
                      : "12px 12px 12px 2px",
                  padding: "8px 11px",
                  fontSize: 12,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", color: "#555", fontSize: 12, padding: "4px 0" }}>
                thinking...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              borderTop: "0.5px solid #2a2a2a",
              padding: "10px 12px",
              display: "flex",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything..."
              style={{
                flex: 1,
                background: "#252525",
                border: "0.5px solid #333",
                borderRadius: 8,
                color: "#fff",
                padding: "7px 10px",
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? "#2a2a2a" : "#2563eb",
                color: loading || !input.trim() ? "#555" : "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 13px",
                fontSize: 14,
                cursor: loading || !input.trim() ? "default" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
              }}
            >
              ↑
            </button>
          </div>
          </>)}
        </div>
      )}
    </>
  );
}
