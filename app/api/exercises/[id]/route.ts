// app/api/exercises/[id]/route.ts
// Updates an existing Exercise row.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, muscleGroups, equipment, cues, youtubeUrl, gifUrl } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const exercise = await db.exercise.update({
      where: { id },
      data: {
        name: name.trim(),
        muscleGroups: muscleGroups ?? [],
        equipment: equipment ?? [],
        cues: cues?.trim() || null,
        youtubeUrl: youtubeUrl?.trim() || null,
        gifUrl: gifUrl || null,
      },
    });

    return NextResponse.json({ exercise });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "An exercise with that name already exists" }, { status: 409 });
    }
    console.error("exercises PATCH error", err);
    return NextResponse.json({ error: "Failed to update exercise" }, { status: 500 });
  }
}
