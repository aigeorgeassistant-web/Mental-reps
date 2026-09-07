import { NextRequest, NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "https://ai.mentalreps.work";
const OLLAMA_SECRET = process.env.OLLAMA_SECRET ?? "";

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("x-ai-key");
  if (!OLLAMA_SECRET || authHeader !== OLLAMA_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model ?? "qwen3:8b",
        prompt: body.prompt,
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Ollama error", status: response.status }, { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json({ response: data.response });
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return NextResponse.json({ error: "AI is resting, try again soon 🤖" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to reach AI" }, { status: 500 });
  }
}
