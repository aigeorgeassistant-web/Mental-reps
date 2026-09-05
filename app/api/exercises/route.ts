// app/api/exercises/route.ts
// Creates a new Exercise row in Postgres after the GIF is already on R2.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, muscleGroups, equipment, cues, youtubeUrl, gifUrl, lowerIsBetter } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const exercise = await db.exercise.create({
      data: {
        name: name.trim(),
        muscleGroups: muscleGroups ?? [],
        equipment: equipment ?? [],
        cues: cues?.trim() || null,
        youtubeUrl: youtubeUrl?.trim() || null,
        gifUrl: gifUrl || null,
        lowerIsBetter: lowerIsBetter ?? false,
        source: "APP_QUICK_ADD",
      },
    });

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "An exercise with that name already exists" }, { status: 409 });
    }
    console.error("exercises POST error", err);
    return NextResponse.json({ error: "Failed to create exercise" }, { status: 500 });
  }
}
