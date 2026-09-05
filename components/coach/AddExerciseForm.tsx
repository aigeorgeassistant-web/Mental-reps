"use client";
// components/coach/AddExerciseForm.tsx
// Inline form rendered inside BuilderLeftPanel when the coach clicks
// "+ Add Exercise". Uploads the GIF immediately on file select (signed
// R2 URL), then saves the exercise row on submit. On success, calls
// onDone() so the parent switches back to the exercise list.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Forearms", "Core", "Glutes", "Quads", "Hamstrings",
  "Calves", "Full Body", "Cardio",
];

const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Machine", "Cable",
  "Bands", "Kettlebell", "Bench", "Other",
];

export function AddExerciseForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [cues, setCues] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // GIF upload state
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [gifPublicUrl, setGifPublicUrl] = useState<string | null>(null);
  const [gifUploading, setGifUploading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  async function handleGifSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setGifFile(file);
    setGifError(null);
    setGifPublicUrl(null);
    setGifUploading(true);

    try {
      // 1. Get signed URL
      const res = await fetch("/api/exercises/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "image/gif" }),
      });
      if (!res.ok) throw new Error("Could not get upload URL");
      const { signedUrl, publicUrl } = await res.json();

      // 2. Upload directly to R2
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/gif" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload to R2 failed");

      setGifPublicUrl(publicUrl);
    } catch (err: any) {
      setGifError(err.message ?? "Upload failed");
      setGifFile(null);
    } finally {
      setGifUploading(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { setSaveError("Name is required"); return; }
    if (gifUploading) { setSaveError("Wait for GIF upload to finish"); return; }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          muscleGroups,
          equipment,
          cues: cues.trim() || null,
          youtubeUrl: youtubeUrl.trim() || null,
          gifUrl: gifPublicUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }

      router.refresh(); // re-fetches exercises list from server
      onDone();
    } catch (err: any) {
      setSaveError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onDone}
          className="text-neutral-400 hover:text-neutral-700 text-sm"
          title="Back"
        >
          ←
        </button>
        <p className="text-sm font-medium">New Exercise</p>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Romanian Deadlift"
          className="w-full rounded border px-2 py-1 text-sm"
          autoFocus
        />
      </div>

      {/* Muscle Groups */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Muscle Groups</label>
        <div className="flex flex-wrap gap-1">
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg}
              onClick={() => toggleItem(muscleGroups, setMuscleGroups, mg)}
              className={`rounded px-2 py-0.5 text-xs border transition-colors ${
                muscleGroups.includes(mg)
                  ? "bg-neutral-800 text-white border-neutral-800"
                  : "text-neutral-600 border-neutral-300 hover:border-neutral-500"
              }`}
            >
              {mg}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Equipment</label>
        <div className="flex flex-wrap gap-1">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <button
              key={eq}
              onClick={() => toggleItem(equipment, setEquipment, eq)}
              className={`rounded px-2 py-0.5 text-xs border transition-colors ${
                equipment.includes(eq)
                  ? "bg-neutral-800 text-white border-neutral-800"
                  : "text-neutral-600 border-neutral-300 hover:border-neutral-500"
              }`}
            >
              {eq}
            </button>
          ))}
        </div>
      </div>

      {/* Cues */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Cues</label>
        <textarea
          value={cues}
          onChange={(e) => setCues(e.target.value)}
          placeholder="Coaching cues..."
          rows={3}
          className="w-full rounded border px-2 py-1 text-sm resize-none"
        />
      </div>

      {/* YouTube URL */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">YouTube URL (optional)</label>
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtube.com/..."
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>

      {/* GIF Upload */}
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">GIF</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/gif,image/*"
          onChange={handleGifSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={gifUploading}
          className="rounded border px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          {gifUploading ? "Uploading…" : "Browse"}
        </button>

        {gifFile && !gifUploading && !gifError && (
          <p className="mt-1 text-xs text-neutral-500 truncate">{gifFile.name}</p>
        )}
        {gifPublicUrl && !gifUploading && (
          <p className="mt-1 text-xs text-green-600">✓ Uploaded</p>
        )}
        {gifError && (
          <p className="mt-1 text-xs text-red-500">{gifError}</p>
        )}
      </div>

      {/* Save error */}
      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving || gifUploading}
          className="flex-1 rounded bg-neutral-800 text-white py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Exercise"}
        </button>
        <button
          onClick={onDone}
          className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
