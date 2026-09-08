import { NextRequest, NextResponse } from "next/server";
import { getCurrentRole } from "@/lib/role";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "https://ai.mentalreps.work";

export async function POST(req: NextRequest) {
  const { role } = await getCurrentRole() as any;
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messages, system } = await req.json();

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:8b",
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          ...messages,
        ],
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Ollama error" }, { status: 502 });
    }

    const data = await response.json();
    // Strip Qwen3 <think>...</think> blocks before sending to client
    let content: string = data.message?.content ?? "";
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return NextResponse.json({ message: content });
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return NextResponse.json({ error: "AI is resting 🤖" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to reach AI" }, { status: 500 });
  }
}
