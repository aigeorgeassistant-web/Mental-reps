"use client";
// Left panel of ProgramBuilder — Week/Month/Exercises tabs.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";
import { createSessionOnDate, moveSessionToDate, deleteSessionsByIds } from "@/lib/actions/session-actions";
import { AddExerciseForm } from "@/components/coach/AddExerciseForm";
import { copySessionToClient } from "@/lib/actions/copy-session-action";
import {
  createTemplateProgram,
  addTemplateDaySession,
  getTemplateSessions,
  type TemplateSessionRow,
} from "@/lib/actions/template-actions";

type ClientWithPrograms = Client & {
  programs: (Program & {
    sessions: (Session & {
      sessionExercises: (SessionExercise & { exercise: Exercise })[];
    })[];
  })[];
};

type ProgramWithSessions = ClientWithPrograms["programs"][number];
type Tab = "week" | "month" | "exercises";
type ExercisesView = "list" | "add";
type TemplateModeState = { programId: string; name: string };

export function BuilderLeftPanel({
  clientId,
  client,
  program,
  exercises,
  monthCursor,
  setMonthCursor,
  onSelectSession,
  onSelectExercise,
  onPreviewExercise,
  onSelectTemplateSession,
  onExitTemplateMode,
}: {
  clientId: string;
  client: ClientWithPrograms;
  program: ProgramWithSessions | undefined;
  exercises: Exercise[];
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectExercise: (exerciseId: string) => void;
  onPreviewExercise: (exerciseId: string) => void;
  onSelectTemplateSession: (sessionId: string) => void;
  onExitTemplateMode: () => void;
}) {
  const [tab, setTab] = useState<Tab>("month");
  const [exercisesView, setExercisesView] = useState<ExercisesView>("list");
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Template builder state
  const [templateMode, setTemplateMode] = useState<TemplateModeState | null>(null);
  const [templateSessions, setTemplateSessions] = useState<TemplateSessionRow[]>([]);
  const [weekCount, setWeekCount] = useState(1);
  const [showNamePopup, setShowNamePopup] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [addingDay, setAddingDay] = useState(false);

  const router = useRouter();
  const sessions = program?.sessions ?? [];

  const sessionsByWeek = useMemo(() => {
    const groups = new Map<number, Session[]>();
    for (const s of sessions) {
      const week = s.weekNumber ?? 0;
      if (!groups.has(week)) groups.set(week, []);
      groups.get(week)!.push(s);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [sessions]);

  const sessionsByDateKey = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.date) continue;
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  // All unique muscle groups across exercises
  const allMuscleGroups = useMemo(() => {
    const set = new Set<string>();
    for (const ex of exercises) {
      for (const mg of ex.muscleGroups) set.add(mg);
    }
    return [...set].sort();
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    let list = exercises;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    if (muscleFilter.length > 0) {
      list = list.filter((e) => muscleFilter.every((mg) => e.muscleGroups.includes(mg)));
    }
    return list;
  }, [exercises, search, muscleFilter]);

  function handleDayClick(dateKey: string) {
    if (deleteMode) return;
    startTransition(async () => {
      const sessionId = await createSessionOnDate(clientId, dateKey);
      router.refresh();
      onSelectSession(sessionId);
    });
  }

  async function handleDropOnCalendar(
    sessionId: string,
    sourceClientId: string,
    targetDateKey: string
  ) {
    if (deleteMode) return;
    // Same client = move
    if (sourceClientId === clientId) {
      setDropStatus("Moving…");
      const result = await moveSessionToDate(sessionId, targetDateKey);
      if (result.success) {
        router.refresh();
        setDropStatus("✓ Moved");
        setTimeout(() => setDropStatus(null), 2000);
      } else {
        setDropStatus(`Error: ${result.error}`);
        setTimeout(() => setDropStatus(null), 3000);
      }
      return;
    }
    // Different client = copy
    setDropStatus("Copying…");
    const result = await copySessionToClient(sessionId, clientId, targetDateKey);
    if (result.success) {
      router.refresh();
      setDropStatus("✓ Copied");
      setTimeout(() => setDropStatus(null), 2000);
    } else {
      setDropStatus(`Error: ${result.error}`);
      setTimeout(() => setDropStatus(null), 3000);
    }
  }

  function handleChipClick(sessionId: string) {
    if (!deleteMode) {
      onSelectSession(sessionId);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    const result = await deleteSessionsByIds(selectedIds);
    setDeleting(false);
    if (result.success) {
      router.refresh();
      setSelectedIds([]);
      setDeleteMode(false);
    } else {
      setDropStatus(`Error: ${result.error}`);
      setTimeout(() => setDropStatus(null), 3000);
    }
  }

  function exitDeleteMode() {
    setDeleteMode(false);
    setSelectedIds([]);
  }

  async function handleCreateTemplate() {
    if (!templateName.trim()) return;
    setCreatingTemplate(true);
    const result = await createTemplateProgram(templateName.trim());
    setCreatingTemplate(false);
    if ("error" in result) return;
    setTemplateMode({ programId: result.programId, name: templateName.trim() });
    setTemplateSessions([]);
    setWeekCount(1);
    setShowNamePopup(false);
    setTemplateName("");
    setTab("week");
  }

  async function handleAddTemplateDay(weekNumber: number) {
    if (!templateMode || addingDay) return;
    setAddingDay(true);
    const result = await addTemplateDaySession(templateMode.programId, weekNumber);
    if ("error" in result) { setAddingDay(false); return; }
    const updated = await getTemplateSessions(templateMode.programId);
    setTemplateSessions(updated);
    setAddingDay(false);
    onSelectTemplateSession(result.sessionId);
  }

  function handleExitTemplate() {
    setTemplateMode(null);
    setTemplateSessions([]);
    setWeekCount(1);
    onExitTemplateMode();
  }

  function toggleMuscleFilter(mg: string) {
    setMuscleFilter((prev) =>
      prev.includes(mg) ? prev.filter((x) => x !== mg) : [...prev, mg]
    );
  }

  return (
    <div className="w-1/4 border-r flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <p className="text-sm font-medium">{client.name}</p>
        {dropStatus && (
          <span className={`text-xs ${dropStatus.startsWith("✓") ? "text-green-600" : dropStatus.includes("…") ? "text-blue-500" : "text-red-500"}`}>
            {dropStatus}
          </span>
        )}
      </div>

      <div className="flex border-b text-sm">
        <TabButton label="Month" active={tab === "month"} onClick={() => { setTab("month"); exitDeleteMode(); }} />
        <TabButton label="Week" active={tab === "week"} onClick={() => { setTab("week"); exitDeleteMode(); }} />
        <TabButton label="Exercises" active={tab === "exercises"} onClick={() => { setTab("exercises"); setExercisesView("list"); exitDeleteMode(); }} />
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {tab === "month" && (
          <MonthCalendar
            monthCursor={monthCursor}
            setMonthCursor={setMonthCursor}
            sessionsByDateKey={sessionsByDateKey}
            currentClientId={clientId}
            onDayClick={handleDayClick}
            onChipClick={handleChipClick}
            onDropSession={handleDropOnCalendar}
            disabled={isPending}
            deleteMode={deleteMode}
            selectedIds={selectedIds}
            onToggleDeleteMode={() => {
              if (deleteMode) exitDeleteMode();
              else setDeleteMode(true);
            }}
            onDeleteSelected={handleDeleteSelected}
            deleting={deleting}
          />
        )}

        {tab === "week" && (
          templateMode ? (
            <TemplateBuilder
              templateMode={templateMode}
              templateSessions={templateSessions}
              weekCount={weekCount}
              addingDay={addingDay}
              onAddWeek={() => setWeekCount((w) => w + 1)}
              onAddDay={handleAddTemplateDay}
              onSelectDay={onSelectTemplateSession}
              onExit={handleExitTemplate}
            />
          ) : (
            <div>
              {sessionsByWeek.length === 0 ? (
                <EmptyState text="No sessions yet — add one from the Month tab." />
              ) : (
                sessionsByWeek.map(([week, weekSessions]) => (
                  <div key={week} className="mb-4">
                    <p className="text-xs font-medium text-neutral-500 mb-1">
                      {week === 0 ? "Week —" : `Week ${week}`}
                    </p>
                    {weekSessions.sort((a, b) => a.order - b.order).map((s) => (
                      <SessionRow key={s.id} session={s} onClick={() => onSelectSession(s.id)} />
                    ))}
                  </div>
                ))
              )}
              <div className="mt-4">
                {showNamePopup ? (
                  <NameTemplateForm
                    value={templateName}
                    onChange={setTemplateName}
                    onConfirm={handleCreateTemplate}
                    onCancel={() => { setShowNamePopup(false); setTemplateName(""); }}
                    loading={creatingTemplate}
                  />
                ) : (
                  <button
                    onClick={() => setShowNamePopup(true)}
                    className="w-full text-left text-xs text-neutral-400 hover:text-neutral-600 border border-dashed border-neutral-200 rounded px-2 py-2"
                  >
                    + Build Template
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {tab === "exercises" && exercisesView === "add" && (
          <AddExerciseForm onDone={() => setExercisesView("list")} />
        )}

        {tab === "exercises" && exercisesView === "list" && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded border px-2 py-1 text-sm"
              />
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`shrink-0 rounded border px-2 py-1 text-xs transition-colors ${muscleFilter.length > 0 ? "bg-green-500 text-white border-green-500" : "text-neutral-500 hover:bg-neutral-100"}`}
                title="Filter by muscle group"
              >
                Filter
              </button>
              <button
                onClick={() => setExercisesView("add")}
                className="shrink-0 rounded bg-neutral-800 text-white px-2 py-1 text-xs hover:bg-neutral-700"
                title="Add new exercise"
              >
                + Add
              </button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-1 mb-3">
                {allMuscleGroups.map((mg) => (
                  <button
                    key={mg}
                    onClick={() => toggleMuscleFilter(mg)}
                    className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${muscleFilter.includes(mg) ? "bg-green-500 text-white border-green-500" : "text-neutral-500 border-neutral-200 hover:bg-neutral-100"}`}
                  >
                    {mg}
                  </button>
                ))}
                {muscleFilter.length > 0 && (
                  <button
                    onClick={() => setMuscleFilter([])}
                    className="rounded-full px-2 py-0.5 text-[10px] border border-red-200 text-red-400 hover:bg-red-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {filteredExercises.length === 0 ? (
              <EmptyState text="No exercises match." />
            ) : (
              filteredExercises.map((ex) => (
                <div key={ex.id} className="flex items-center rounded hover:bg-neutral-100">
                  <button onClick={() => onSelectExercise(ex.id)} className="flex-1 text-left px-2 py-2 text-sm">
                    {ex.name}
                  </button>
                  <button onClick={() => onPreviewExercise(ex.id)} className="px-2 py-2 text-[11px] text-neutral-400 hover:text-neutral-700 underline">
                    View
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateBuilder({
  templateMode, templateSessions, weekCount, addingDay,
  onAddWeek, onAddDay, onSelectDay, onExit,
}: {
  templateMode: TemplateModeState;
  templateSessions: TemplateSessionRow[];
  weekCount: number;
  addingDay: boolean;
  onAddWeek: () => void;
  onAddDay: (weekNumber: number) => void;
  onSelectDay: (sessionId: string) => void;
  onExit: () => void;
}) {
  const sessionsByWeek = useMemo(() => {
    const map = new Map<number, TemplateSessionRow[]>();
    for (const s of templateSessions) {
      const w = s.weekNumber ?? 1;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(s);
    }
    return map;
  }, [templateSessions]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-700 truncate">📋 {templateMode.name}</p>
        <button onClick={onExit} className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700" title="Exit template builder">✕</button>
      </div>
      {Array.from({ length: weekCount }, (_, i) => i + 1).map((weekNum) => {
        const days = (sessionsByWeek.get(weekNum) ?? []).sort((a, b) => a.order - b.order);
        return (
          <div key={weekNum}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-neutral-500">Week {weekNum}</p>
              <button onClick={() => onAddDay(weekNum)} disabled={addingDay} className="text-[10px] text-neutral-400 hover:text-neutral-700 border border-neutral-200 rounded px-1.5 py-0.5 disabled:opacity-40">
                {addingDay ? "…" : "+ Day"}
              </button>
            </div>
            {days.length === 0 ? (
              <p className="text-[10px] text-neutral-300 pl-2">No days yet</p>
            ) : (
              days.map((day) => (
                <button key={day.id} onClick={() => onSelectDay(day.id)} className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-neutral-100 flex items-center justify-between group">
                  <span>{day.dayLabel}</span>
                  <span className="text-neutral-300 group-hover:text-neutral-500">→</span>
                </button>
              ))
            )}
          </div>
        );
      })}
      <button onClick={onAddWeek} className="text-xs text-neutral-400 hover:text-neutral-600 border border-dashed border-neutral-200 rounded px-2 py-1.5 text-left">
        + Add Week
      </button>
    </div>
  );
}

function NameTemplateForm({ value, onChange, onConfirm, onCancel, loading }: {
  value: string; onChange: (v: string) => void; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="border rounded p-3 flex flex-col gap-2">
      <p className="text-xs font-medium">New Template</p>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 3×/week Strength" className="w-full rounded border px-2 py-1 text-sm"
        autoFocus onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); if (e.key === "Escape") onCancel(); }}
      />
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={loading || !value.trim()} className="flex-1 rounded bg-neutral-800 text-white py-1 text-xs hover:bg-neutral-700 disabled:opacity-50">
          {loading ? "Creating…" : "Create"}
        </button>
        <button onClick={onCancel} className="rounded border px-2 py-1 text-xs hover:bg-neutral-100">Cancel</button>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 ${active ? "border-b-2 border-black font-medium" : "text-neutral-500"}`}>
      {label}
    </button>
  );
}

function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded px-2 py-2 text-sm hover:bg-neutral-100">
      {session.dayLabel}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-neutral-400">{text}</p>;
}

function MonthCalendar({
  monthCursor, setMonthCursor, sessionsByDateKey, currentClientId,
  onDayClick, onChipClick, onDropSession, disabled,
  deleteMode, selectedIds, onToggleDeleteMode, onDeleteSelected, deleting,
}: {
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  sessionsByDateKey: Map<string, Session[]>;
  currentClientId: string;
  onDayClick: (dateKey: string) => void;
  onChipClick: (sessionId: string) => void;
  onDropSession: (sessionId: string, sourceClientId: string, targetDateKey: string) => void;
  disabled: boolean;
  deleteMode: boolean;
  selectedIds: string[];
  onToggleDeleteMode: () => void;
  onDeleteSelected: () => void;
  deleting: boolean;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function handleDrop(e: React.DragEvent, key: string) {
    e.preventDefault();
    setDragOver(null);
    if (deleteMode) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { sessionId, sourceClientId } = data;
      if (sessionId && sourceClientId) onDropSession(sessionId, sourceClientId, key);
    } catch { }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} className="text-sm px-2 py-1 hover:bg-neutral-100 rounded">←</button>
        <p className="text-sm font-medium">{monthLabel}</p>
        <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} className="text-sm px-2 py-1 hover:bg-neutral-100 rounded">→</button>
      </div>

      {/* Delete mode toolbar */}
      <div className="flex items-center justify-between mb-2 min-h-[24px]">
        <button
          onClick={onToggleDeleteMode}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${deleteMode ? "bg-red-500 text-white border-red-500" : "text-neutral-400 border-neutral-200 hover:bg-neutral-100"}`}
        >
          {deleteMode ? "✕ Cancel" : "🗑 Select"}
        </button>
        {deleteMode && selectedIds.length > 0 && (
          <button
            onClick={onDeleteSelected}
            disabled={deleting}
            className="text-xs px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : `Delete ${selectedIds.length}`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-neutral-400 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map(({ date, inMonth, key }) => {
          const daySessions = sessionsByDateKey.get(key) ?? [];
          const isOver = dragOver === key;
          return (
            <div
              key={key}
              className={`aspect-square rounded border text-[11px] p-1 flex flex-col transition-colors ${inMonth ? "" : "opacity-30"} ${isOver ? "border-blue-400 bg-blue-50" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (!deleteMode) setDragOver(key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, key)}
            >
              <span className="text-neutral-500">{date.getDate()}</span>
              {daySessions.length > 0 ? (
                <div
                  draggable={!deleteMode}
                  onDragStart={(e) => {
                    if (deleteMode) return;
                    e.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ sessionId: daySessions[0].id, sourceClientId: currentClientId })
                    );
                  }}
                  className="mt-auto"
                >
                  <button
                    onClick={() => onChipClick(daySessions[0].id)}
                    className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] transition-colors ${
                      deleteMode
                        ? selectedIds.includes(daySessions[0].id)
                          ? "bg-red-500 text-white"
                          : "bg-red-100 text-red-700 border border-red-300"
                        : "bg-neutral-800 text-white cursor-grab active:cursor-grabbing"
                    }`}
                    title={daySessions[0].dayLabel}
                  >
                    {deleteMode && selectedIds.includes(daySessions[0].id) ? "✓ " : ""}{daySessions[0].dayLabel}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onDayClick(key)}
                  disabled={disabled || deleteMode}
                  className="mt-auto text-neutral-300 hover:text-neutral-600 disabled:opacity-50"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
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
