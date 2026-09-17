import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/role";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const VL_MODEL = "qwen3-vl:latest";

const EXTRACT_PROMPT = `You are a data extraction tool. Extract body composition values from this InBody scan image.

Return ONLY a valid JSON object with these exact keys (use null if a value is not visible):
{
  "weight": number or null,
  "muscleMass": number or null,
  "fatPercent": number or null,
  "visceralFat": number or null,
  "bmr": number or null,
  "phaseAngle": number or null,
  "rawText": "brief summary of what you read"
}

Rules:
- Numbers only, no units
- fatPercent is a percentage (e.g. 18.5 not 0.185)
- If a field is missing from the sheet, use null
- Return ONLY the JSON object, no other text`;

function parseFloat_safe(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  // Call Ollama VL
  let ollamaRaw: string;
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VL_MODEL,
        stream: false,
        messages: [
          {
            role: "user",
            content: EXTRACT_PROMPT,
            images: [imageBase64],
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json({ error: "Ollama VL unavailable" }, { status: 503 });
    }

    const ollamaData = await ollamaRes.json();
    ollamaRaw = ollamaData?.message?.content ?? "";
  } catch {
    return NextResponse.json({ error: "Ollama request failed" }, { status: 503 });
  }

  // Parse JSON from Ollama response
  let extracted: Record<string, unknown>;
  try {
    const jsonMatch = ollamaRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    extracted = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Could not parse scan data", raw: ollamaRaw }, { status: 422 });
  }

  // Validate + sanitise — only known numeric fields go to DB
  const scan = await db.bodyScan.create({
    data: {
      clientId: client.id,
      weight:      parseFloat_safe(extracted.weight),
      muscleMass:  parseFloat_safe(extracted.muscleMass),
      fatPercent:  parseFloat_safe(extracted.fatPercent),
      visceralFat: parseFloat_safe(extracted.visceralFat),
      bmr:         parseFloat_safe(extracted.bmr),
      phaseAngle:  parseFloat_safe(extracted.phaseAngle),
      rawText:     typeof extracted.rawText === "string" ? extracted.rawText.slice(0, 500) : null,
    },
  });

  return NextResponse.json({ ok: true, scan });
}
