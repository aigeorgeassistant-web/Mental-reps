import { NextRequest, NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "https://ai.mentalreps.work";

export async function POST(req: NextRequest) {
  const { role } = await getCurrentRole() as any;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messages, system } = await req.json();

    // Build a single prompt from message history (uses /api/generate which is proven to work)
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
        model: "qwen3:8b",
        prompt,
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(60000),
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
      return NextResponse.json({ error: "AI is resting 🤖" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to reach AI", detail: String(err) }, { status: 500 });
  }
}
