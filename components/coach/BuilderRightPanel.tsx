"use client";
// Right panel — Detail | Browse Clients | Templates tabs
// Detail: exercise GIF, cues, edit form
// Browse Clients: search → pick client → their month calendar, drag sessions ↔ left panel
// Templates: list saved templates, expand to see days, drag single day to left panel,
//            "Add full template" with start date + weekday picker → conflict warning → apply

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exercise } from "@prisma/client";
import { copySessionToClient } from "@/lib/actions/copy-session-action";
import {
  previewTemplateApplication,
  applyTemplateToClient,
} from "@/lib/actions/apply-template-action";

// ─── Types ────────────────────────────────────────────────────────────────────

type RightPanelTab = "detail" | "browse" | "templates";
type ClientRow = { id: string; name: string };
type SessionRow = { id: string; dayLabel: string; date: string };
type TemplateSession = { id: string; weekNumber: number | null; dayLabel: string; order: number };
type TemplateRow = { id: string; name: string; sessions: TemplateSession[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Forearms", "Core", "Glutes", "Quads", "Hamstrings",
  "Calves", "Full Body", "Cardio",
];
const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Machine", "Cable",
  "Bands", "Kettlebell", "Bench", "Other",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function buildMonthGrid(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const days: { date: Date; inMonth: boolean; key: string }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    days.push({ date, inMonth: date.getMonth() === month, key });
  }
  return days;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function localDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-xs ${active ? "border-b-2 border-black font-medium" : "text-neutral-500"}`}
    >
      {label}
    </button>
  );
}

// ─── Edit Exercise Form ───────────────────────────────────────────────────────

function EditExerciseForm({ exercise, onDone }: { exercise: Exercise; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(exercise.name);
  const [muscleGroups, setMuscleGroups] = useState<string[]>(exercise.muscleGroups);
  const [equipment, setEquipment] = useState<string[]>(exercise.equipment);
  const [cues, setCues] = useState(exercise.cues ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(exercise.youtubeUrl ?? "");
  const [gifPublicUrl, setGifPublicUrl] = useState<string | null>(null);
  const [gifFile, setGifFile] = useState<File | null>(null);
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
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          muscleGroups,
          equipment,
          cues: cues.trim() || null,
          youtubeUrl: youtubeUrl.trim() || null,
          gifUrl: gifPublicUrl ?? exercise.gifUrl,
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
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button onClick={onDone} className="text-neutral-400 hover:text-neutral-700 text-sm">←</button>
        <p className="text-sm font-medium">Edit Exercise</p>
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" autoFocus />
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Muscle Groups</label>
        <div className="flex flex-wrap gap-1">
          {MUSCLE_GROUPS.map((mg) => (
            <button key={mg} onClick={() => setMuscleGroups(toggleItem(muscleGroups, mg))}
              className={`rounded px-2 py-0.5 text-xs border transition-colors ${muscleGroups.includes(mg) ? "bg-neutral-800 text-white border-neutral-800" : "text-neutral-600 border-neutral-300 hover:border-neutral-500"}`}>
              {mg}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Equipment</label>
        <div className="flex flex-wrap gap-1">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <button key={eq} onClick={() => setEquipment(toggleItem(equipment, eq))}
              className={`rounded px-2 py-0.5 text-xs border transition-colors ${equipment.includes(eq) ? "bg-neutral-800 text-white border-neutral-800" : "text-neutral-600 border-neutral-300 hover:border-neutral-500"}`}>
              {eq}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">Cues</label>
        <textarea value={cues} onChange={(e) => setCues(e.target.value)} rows={3} className="w-full rounded border px-2 py-1 text-sm resize-none" />
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">YouTube URL</label>
        <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full rounded border px-2 py-1 text-sm" />
      </div>
      <div>
        <label className="text-xs text-neutral-500 mb-1 block">GIF {exercise.gifUrl ? "(replace)" : "(upload)"}</label>
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
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onDone} className="rounded border px-3 py-1.5 text-sm hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({ exercise }: { exercise: Exercise | null }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [exercise?.id]);

  if (!exercise) {
    return (
      <div className="flex-1 p-4">
        <p className="text-xs text-neutral-400">Click an exercise name in the middle panel to see its demo and cues here.</p>
      </div>
    );
  }
  if (editing) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EditExerciseForm exercise={exercise} onDone={() => setEditing(false)} />
      </div>
    );
  }
  const embedUrl = exercise.youtubeUrl ? youtubeEmbedUrl(exercise.youtubeUrl) : null;
  return (
    <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{exercise.name}</p>
        <button onClick={() => setEditing(true)} className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700 underline">Edit</button>
      </div>
      {exercise.gifUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={exercise.gifUrl} alt={exercise.name} className="w-full rounded border bg-neutral-50" />
      )}
      {embedUrl && <iframe src={embedUrl} className="w-full aspect-video rounded border" allowFullScreen />}
      {!exercise.gifUrl && !embedUrl && <p className="text-xs text-neutral-400">No demo media for this exercise yet.</p>}
      {exercise.cues && (
        <div>
          <p className="text-xs font-medium text-neutral-500 mb-1">Cues</p>
          <p className="text-xs text-neutral-700 whitespace-pre-line">{exercise.cues}</p>
        </div>
      )}
      <div className="border-t pt-3">
        <p className="text-xs font-medium text-neutral-500 mb-1">Progression</p>
        <p className="text-xs text-neutral-400">Log history coming soon.</p>
      </div>
    </div>
  );
}

// ─── Browse Clients — Calendar ─────────────────────────────────────────────────

function BrowseCalendar({
  monthCursor,
  setMonthCursor,
  sessionsByKey,
  loading,
  browseClientId,
  onDropFromLeft,
}: {
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  sessionsByKey: Map<string, SessionRow[]>;
  loading: boolean;
  browseClientId: string;
  onDropFromLeft: (e: React.DragEvent, dateKey: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} className="text-sm px-1 hover:bg-neutral-100 rounded">←</button>
        <p className="text-xs font-medium">{monthLabel}</p>
        <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} className="text-sm px-1 hover:bg-neutral-100 rounded">→</button>
      </div>
      {loading ? (
        <p className="text-xs text-neutral-400 text-center py-4">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-0.5 text-[9px] text-neutral-400 mb-1">
            {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map(({ date, inMonth, key }) => {
              const daySessions = sessionsByKey.get(key) ?? [];
              const isOver = dragOver === key;
              return (
                <div
                  key={key}
                  className={`aspect-square rounded border text-[9px] p-0.5 flex flex-col transition-colors ${inMonth ? "" : "opacity-30"} ${isOver ? "border-blue-400 bg-blue-50" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { setDragOver(null); onDropFromLeft(e, key); }}
                >
                  <span className="text-neutral-500 leading-none">{date.getDate()}</span>
                  {daySessions.length > 0 && (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", JSON.stringify({
                          sessionId: daySessions[0].id,
                          sourceClientId: browseClientId,
                        }));
                      }}
                      className="mt-auto truncate rounded bg-neutral-700 text-white px-0.5 py-0.5 text-left cursor-grab active:cursor-grabbing leading-none"
                      title={daySessions[0].dayLabel}
                    >
                      {daySessions[0].dayLabel}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-neutral-400 mt-2 text-center">Drag sessions ↔ left panel</p>
        </>
      )}
    </div>
  );
}

// ─── Browse Clients View ──────────────────────────────────────────────────────

function BrowseClientsView({
  currentClientId,
  monthCursor,
}: {
  currentClientId: string;
  monthCursor: Date;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [localMonth, setLocalMonth] = useState<Date>(
    () => new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
  );
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/coach/clients")
      .then((r) => r.json())
      .then(setClients)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClient) {
      setLocalMonth(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1));
    }
  }, [monthCursor, selectedClient]);

  function fetchSessions(client: ClientRow, month: Date) {
    const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    setLoading(true);
    fetch(`/api/coach/clients/${client.id}/sessions?month=${monthStr}`)
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!selectedClient) return;
    fetchSessions(selectedClient, localMonth);
  }, [selectedClient?.id, localMonth]);

  async function handleDropFromLeft(e: React.DragEvent, targetDateKey: string) {
    e.preventDefault();
    if (!selectedClient) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { sessionId, sourceClientId } = data;
      if (sourceClientId === selectedClient.id) return;
      setCopyStatus("Copying…");
      const result = await copySessionToClient(sessionId, selectedClient.id, targetDateKey);
      if (result.success) {
        setCopyStatus("✓ Copied");
        fetchSessions(selectedClient, localMonth);
        router.refresh();
        setTimeout(() => setCopyStatus(null), 2000);
      } else {
        setCopyStatus(`Error: ${result.error}`);
        setTimeout(() => setCopyStatus(null), 3000);
      }
    } catch {
      setCopyStatus("Error copying");
      setTimeout(() => setCopyStatus(null), 3000);
    }
  }

  const sessionsByKey = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      if (!s.date) continue;
      const key = localDateKey(s.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  const filtered = clients.filter(
    (c) => c.id !== currentClientId && c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!selectedClient) {
    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        <input type="text" placeholder="Search clients…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border px-2 py-1 text-sm" autoFocus />
        {filtered.length === 0 && <p className="text-xs text-neutral-400">No other clients found.</p>}
        {filtered.map((c) => (
          <button key={c.id} onClick={() => setSelectedClient(c)}
            className="w-full text-left rounded border px-3 py-2 text-sm hover:bg-neutral-100">
            {c.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={() => { setSelectedClient(null); setSessions([]); setCopyStatus(null); }}
          className="text-xs text-neutral-400 hover:text-neutral-700">←</button>
        <p className="text-sm font-medium truncate">{selectedClient.name}</p>
        {copyStatus && (
          <span className={`text-xs ml-auto shrink-0 ${copyStatus.startsWith("✓") ? "text-green-600" : copyStatus === "Copying…" ? "text-blue-500" : "text-red-500"}`}>
            {copyStatus}
          </span>
        )}
      </div>
      <BrowseCalendar
        monthCursor={localMonth}
        setMonthCursor={setLocalMonth}
        sessionsByKey={sessionsByKey}
        loading={loading}
        browseClientId={selectedClient.id}
        onDropFromLeft={handleDropFromLeft}
      />
    </div>
  );
}

// ─── Add Full Template Popup ──────────────────────────────────────────────────

function AddTemplatePopup({
  template,
  clientName,
  currentClientId,
  onClose,
  onApplied,
}: {
  template: TemplateRow;
  clientName: string;
  currentClientId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [startDate, setStartDate] = useState(todayKey);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<"setup" | "confirm">("setup");
  const [conflictCount, setConflictCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(d: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function handlePreview() {
    if (!startDate || weekdays.size === 0) return;
    setLoading(true);
    setError(null);
    const result = await previewTemplateApplication(
      template.id,
      currentClientId,
      startDate,
      [...weekdays]
    );
    setLoading(false);
    if ("error" in result) { setError(result.error); return; }
    setConflictCount(result.conflictCount);
    setStage("confirm");
  }

  async function handleApply() {
    setLoading(true);
    setError(null);
    const result = await applyTemplateToClient(
      template.id,
      currentClientId,
      startDate,
      [...weekdays]
    );
    setLoading(false);
    if ("error" in result) { setError(result.error); return; }
    onApplied();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 rounded-lg border bg-white p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">Add to {clientName}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{template.name} · {template.sessions.length} sessions</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none">×</button>
        </div>

        {stage === "setup" && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Starting date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border px-2 py-1 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-500">Workout days</label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`flex-1 py-1.5 rounded text-xs border transition-colors ${
                      weekdays.has(i)
                        ? "bg-neutral-800 text-white border-neutral-800"
                        : "text-neutral-600 border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {weekdays.size === 0 && (
                <p className="text-[10px] text-neutral-400">Select at least one day</p>
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded border py-1.5 text-xs hover:bg-neutral-50">
                Cancel
              </button>
              <button
                onClick={handlePreview}
                disabled={loading || weekdays.size === 0 || !startDate}
                className="flex-1 rounded bg-neutral-800 text-white py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-50"
              >
                {loading ? "Checking…" : "Next →"}
              </button>
            </div>
          </>
        )}

        {stage === "confirm" && (
          <>
            {conflictCount > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800 font-medium">
                  {conflictCount} existing session{conflictCount !== 1 ? "s" : ""} will be overwritten
                </p>
                <p className="text-[10px] text-amber-700 mt-1">
                  Any sessions already on those dates for {clientName} will be deleted and replaced.
                </p>
              </div>
            ) : (
              <div className="rounded border border-green-200 bg-green-50 p-3">
                <p className="text-xs text-green-800">No conflicts — {template.sessions.length} sessions will be added.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStage("setup")} className="flex-1 rounded border py-1.5 text-xs hover:bg-neutral-50">
                ← Back
              </button>
              <button
                onClick={handleApply}
                disabled={loading}
                className="flex-1 rounded bg-neutral-800 text-white py-1.5 text-xs hover:bg-neutral-700 disabled:opacity-50"
              >
                {loading ? "Applying…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Templates View ───────────────────────────────────────────────────────────

function TemplatesView({
  currentClientId,
  clientName,
  onSelectTemplateSession,
}: {
  currentClientId: string;
  clientName: string;
  onSelectTemplateSession: (sessionId: string) => void;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<TemplateRow | null>(null);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);

  function fetchTemplates() {
    setLoading(true);
    fetch("/api/coach/templates")
      .then((r) => r.json())
      .then((data) => { setTemplates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { fetchTemplates(); }, []);

  // Group template sessions by week
  function sessionsByWeek(sessions: TemplateSession[]) {
    const map = new Map<number, TemplateSession[]>();
    for (const s of sessions) {
      const w = s.weekNumber ?? 1;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }

  if (loading) {
    return <div className="flex-1 p-4"><p className="text-xs text-neutral-400">Loading…</p></div>;
  }

  if (templates.length === 0) {
    return (
      <div className="flex-1 p-4">
        <p className="text-xs text-neutral-400">No templates yet — build one from the Week tab in the left panel.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
      {applyStatus && (
        <div className={`rounded border px-3 py-2 text-xs ${applyStatus.startsWith("✓") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {applyStatus}
        </div>
      )}

      {templates.map((t) => {
        const expanded = expandedId === t.id;
        const weeks = sessionsByWeek(t.sessions);

        return (
          <div key={t.id} className="border rounded overflow-hidden">
            {/* Template header */}
            <button
              onClick={() => setExpandedId(expanded ? null : t.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-neutral-50"
            >
              <div>
                <p className="text-xs font-medium">{t.name}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {t.sessions.length} session{t.sessions.length !== 1 ? "s" : ""}
                  {" · "}
                  {weeks.length} week{weeks.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="text-neutral-400 text-xs">{expanded ? "▲" : "▼"}</span>
            </button>

            {/* Expanded content */}
            {expanded && (
              <div className="border-t px-3 py-2 flex flex-col gap-2 bg-neutral-50">
                {/* Week/day structure with draggable days */}
                {weeks.map(([weekNum, days]) => (
                  <div key={weekNum}>
                    <p className="text-[10px] font-medium text-neutral-500 mb-1">Week {weekNum}</p>
                    {days
                      .sort((a, b) => a.order - b.order)
                      .map((day) => (
                        <div
                          key={day.id}
                          className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-neutral-100 group"
                        >
                          <button
                            onClick={() => onSelectTemplateSession(day.id)}
                            className="flex-1 text-left hover:underline"
                            title="Click to preview in center panel"
                          >
                            {day.dayLabel}
                          </button>
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "text/plain",
                                JSON.stringify({
                                  sessionId: day.id,
                                  sourceClientId: "__template__",
                                })
                              );
                            }}
                            className="pl-2 text-neutral-300 group-hover:text-neutral-500 cursor-grab active:cursor-grabbing select-none"
                            title="Drag to calendar to copy"
                          >
                            ⠿
                          </div>
                        </div>
                      ))}
                  </div>
                ))}

                {/* Add full template button */}
                <button
                  onClick={() => { setApplyTarget(t); setApplyStatus(null); }}
                  className="mt-1 w-full rounded border border-neutral-300 bg-white py-1.5 text-xs hover:bg-neutral-100 font-medium"
                >
                  Add to {clientName}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Apply popup */}
      {applyTarget && (
        <AddTemplatePopup
          template={applyTarget}
          clientName={clientName}
          currentClientId={currentClientId}
          onClose={() => setApplyTarget(null)}
          onApplied={() => {
            setApplyTarget(null);
            setApplyStatus(`✓ ${applyTarget.name} applied`);
            router.refresh();
            setTimeout(() => setApplyStatus(null), 3000);
          }}
        />
      )}
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function BuilderRightPanel({
  exercise,
  currentClientId,
  clientName,
  monthCursor,
  onSelectTemplateSession,
}: {
  exercise: Exercise | null;
  currentClientId: string;
  clientName: string;
  monthCursor: Date;
  onSelectTemplateSession: (sessionId: string) => void;
}) {
  const [tab, setTab] = useState<RightPanelTab>("detail");

  useEffect(() => {
    if (exercise) setTab("detail");
  }, [exercise?.id]);

  return (
    <div className="w-1/4 border-l flex flex-col">
      <div className="flex border-b shrink-0">
        <TabBtn label="Detail" active={tab === "detail"} onClick={() => setTab("detail")} />
        <TabBtn label="Clients" active={tab === "browse"} onClick={() => setTab("browse")} />
        <TabBtn label="Templates" active={tab === "templates"} onClick={() => setTab("templates")} />
      </div>

      {tab === "detail" && <DetailView exercise={exercise} />}
      {tab === "browse" && (
        <BrowseClientsView currentClientId={currentClientId} monthCursor={monthCursor} />
      )}
      {tab === "templates" && (
        <TemplatesView
          currentClientId={currentClientId}
          clientName={clientName}
          onSelectTemplateSession={onSelectTemplateSession}
        />
      )}
    </div>
  );
}
