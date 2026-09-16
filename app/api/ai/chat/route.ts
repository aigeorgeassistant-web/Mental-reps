import { NextRequest, NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "https://ai.mentalreps.work";
const MODEL = "joe-speedboat/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:Q4_K_M";

export async function POST(req: NextRequest) {
  const { role } = await getCurrentRole() as any;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messages, system } = await req.json();

    const history = (messages as { role: string; content: string }[])
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = system
      ? `${system}\n\n${history}\nAssistant:`
      : `${history}\nAssistant:`;

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(90000), // 90s — MoE is fast but big
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json({ error: "Ollama error", detail: text }, { status: 502 });
    }

    const data = await response.json();
    let content: string = data.response ?? "";
    // Strip Qwen3 <think>...</think> blocks
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return NextResponse.json({ message: content });
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return NextResponse.json({ error: "AI is thinking hard — try again in a moment 🤖" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to reach AI", detail: String(err) }, { status: 500 });
  }
}
