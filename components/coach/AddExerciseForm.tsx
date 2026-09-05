"use client";
// components/coach/AddExerciseForm.tsx

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TaxonomyPicker } from "@/components/coach/TaxonomyPicker";
import { MUSCLE_TAXONOMY, EQUIPMENT_TAXONOMY } from "@/lib/taxonomy";

export function AddExerciseForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [cues, setCues] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [lowerIsBetter, setLowerIsBetter] = useState(false);

  const [gifFile, setGifFile] = useState<File | null>(null);
  const [gifPublicUrl, setGifPublicUrl] = useState<string | null>(null);
  const [gifUploading, setGifUploading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGifSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGifFile(file);
    setGifError(null);
    setGifPublicUrl(null);
    setGifUploading(true);
    try {
      const res = await fetch("/api/exercises/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "image/gif" }),
      });
      if (!res.ok) throw new Error("Could not get upload URL");
      const { signedUrl, publicUrl } = await res.json();
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
          lowerIsBetter,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      router.refresh();
      onDone();
    } catch (err: any) {
      setSaveError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onDone} className="text-neutral-400 hover:text-neutral-700 text-sm">←</button>
        <p className="text-sm font-medium">New Exercise</p>
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Romanian Deadlift" className="w-full rounded border px-2 py-1 text-sm" autoFocus />
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Muscle Groups</label>
        <TaxonomyPicker taxonomy={MUSCLE_TAXONOMY} selected={muscleGroups} onChange={setMuscleGroups} />
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Equipment</label>
        <TaxonomyPicker taxonomy={EQUIPMENT_TAXONOMY} selected={equipment} onChange={setEquipment} />
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Cues</label>
        <textarea value={cues} onChange={(e) => setCues(e.target.value)}
          placeholder="Coaching cues..." rows={3} className="w-full rounded border px-2 py-1 text-sm resize-none" />
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">YouTube URL (optional)</label>
        <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://youtube.com/..." className="w-full rounded border px-2 py-1 text-sm" />
      </div>

      {/* Lower is better toggle */}
      <button
        onClick={() => setLowerIsBetter((v) => !v)}
        className={`flex items-center justify-between rounded border px-3 py-2 text-sm transition-colors ${
          lowerIsBetter ? "border-blue-400 bg-blue-50 text-blue-800" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
        }`}
      >
        <div className="flex flex-col items-start">
          <span className="font-medium text-xs">Lower is better</span>
          <span className="text-[10px] text-neutral-400 mt-0.5">
            e.g. rowing erg for time, assisted pull-ups
          </span>
        </div>
        <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${lowerIsBetter ? "bg-blue-500" : "bg-neutral-300"}`}>
          <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${lowerIsBetter ? "translate-x-4" : "translate-x-0"}`} />
        </div>
      </button>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">GIF</label>
        <input ref={fileInputRef} type="file" accept="image/gif,image/*" onChange={handleGifSelect} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} disabled={gifUploading}
          className="rounded border px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50">
          {gifUploading ? "Uploading…" : "Browse"}
        </button>
        {gifFile && !gifUploading && !gifError && <p className="mt-1 text-xs text-neutral-500 truncate">{gifFile.name}</p>}
        {gifPublicUrl && !gifUploading && <p className="mt-1 text-xs text-green-600">✓ Uploaded</p>}
        {gifError && <p className="mt-1 text-xs text-red-500">{gifError}</p>}
      </div>

      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={saving || gifUploading}
          className="flex-1 rounded bg-neutral-800 text-white py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save Exercise"}
        </button>
        <button onClick={onDone} className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}
