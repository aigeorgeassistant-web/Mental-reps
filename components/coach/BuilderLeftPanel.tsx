"use client";
// Left panel of ProgramBuilder — Week/Month/Exercises tabs.
// Week tab: "Build Template" button → inline name popup → template builder
// (weeks + days structure). Template day click → onSelectTemplateSession.
// Month calendar: session chips draggable (copy to right panel).
// Month calendar days: drop zones (receive from right panel).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";
import { createSessionOnDate } from "@/lib/actions/session-actions";
import { AddExerciseForm } from "@/components/coach/AddExerciseForm";
import { copySessionToClient } from "@/lib/actions/copy-session-action";
import {
  createTemplateProgram,
  addTemplateDaySession,
  getTemplateSessions,
  type TemplateSessionRow,
} from "@/lib/actions/template-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [isPending, startTransition] = useTransition();
  const [dropStatus, setDropStatus] = useState<string | null>(null);

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

  // ─── Derived data ──────────────────────────────────────────────────────────

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
      // Local date parts — NOT toISOString (UTC shift causes off-by-one in Kuwait+3)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [exercises, search]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleDayClick(dateKey: string) {
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
    if (sourceClientId === clientId) return;
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

  // ─── Template handlers ─────────────────────────────────────────────────────

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
    if ("error" in result) {
      setAddingDay(false);
      return;
    }
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-1/4 border-r flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <p className="text-sm font-medium">{client.name}</p>
        {dropStatus && (
          <span
            className={`text-xs ${
              dropStatus.startsWith("✓")
                ? "text-green-600"
                : dropStatus === "Copying…"
                ? "text-blue-500"
                : "text-red-500"
            }`}
          >
            {dropStatus}
          </span>
        )}
      </div>

      <div className="flex border-b text-sm">
        <TabButton label="Month" active={tab === "month"} onClick={() => setTab("month")} />
        <TabButton label="Week" active={tab === "week"} onClick={() => setTab("week")} />
        <TabButton
          label="Exercises"
          active={tab === "exercises"}
          onClick={() => { setTab("exercises"); setExercisesView("list"); }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Month tab ─────────────────────────────────────────────────── */}
        {tab === "month" && (
          <MonthCalendar
            monthCursor={monthCursor}
            setMonthCursor={setMonthCursor}
            sessionsByDateKey={sessionsByDateKey}
            currentClientId={clientId}
            onDayClick={handleDayClick}
            onSelectSession={onSelectSession}
            onDropSession={handleDropOnCalendar}
            disabled={isPending}
          />
        )}

        {/* ── Week tab ──────────────────────────────────────────────────── */}
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
                    {weekSessions
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
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

        {/* ── Exercises tab ─────────────────────────────────────────────── */}
        {tab === "exercises" && exercisesView === "add" && (
          <AddExerciseForm onDone={() => setExercisesView("list")} />
        )}

        {tab === "exercises" && exercisesView === "list" && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="Search exercises..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded border px-2 py-1 text-sm"
              />
              <button
                onClick={() => setExercisesView("add")}
                className="shrink-0 rounded bg-neutral-800 text-white px-2 py-1 text-xs hover:bg-neutral-700"
                title="Add new exercise"
              >
                + Add
              </button>
            </div>

            {filteredExercises.length === 0 ? (
              <EmptyState text="No exercises match." />
            ) : (
              filteredExercises.map((ex) => (
                <div key={ex.id} className="flex items-center rounded hover:bg-neutral-100">
                  <button
                    onClick={() => onSelectExercise(ex.id)}
                    className="flex-1 text-left px-2 py-2 text-sm"
                  >
                    {ex.name}
                  </button>
                  <button
                    onClick={() => onPreviewExercise(ex.id)}
                    className="px-2 py-2 text-[11px] text-neutral-400 hover:text-neutral-700 underline"
                  >
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

// ─── Template Builder UI ──────────────────────────────────────────────────────

function TemplateBuilder({
  templateMode,
  templateSessions,
  weekCount,
  addingDay,
  onAddWeek,
  onAddDay,
  onSelectDay,
  onExit,
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
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-700 truncate">
          📋 {templateMode.name}
        </p>
        <button
          onClick={onExit}
          className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700"
          title="Exit template builder"
        >
          ✕
        </button>
      </div>

      {/* Weeks */}
      {Array.from({ length: weekCount }, (_, i) => i + 1).map((weekNum) => {
        const days = (sessionsByWeek.get(weekNum) ?? []).sort(
          (a, b) => a.order - b.order
        );
        return (
          <div key={weekNum}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-neutral-500">Week {weekNum}</p>
              <button
                onClick={() => onAddDay(weekNum)}
                disabled={addingDay}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 border border-neutral-200 rounded px-1.5 py-0.5 disabled:opacity-40"
              >
                {addingDay ? "…" : "+ Day"}
              </button>
            </div>

            {days.length === 0 ? (
              <p className="text-[10px] text-neutral-300 pl-2">No days yet</p>
            ) : (
              days.map((day) => (
                <button
                  key={day.id}
                  onClick={() => onSelectDay(day.id)}
                  className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-neutral-100 flex items-center justify-between group"
                >
                  <span>{day.dayLabel}</span>
                  <span className="text-neutral-300 group-hover:text-neutral-500">→</span>
                </button>
              ))
            )}
          </div>
        );
      })}

      {/* Add Week */}
      <button
        onClick={onAddWeek}
        className="text-xs text-neutral-400 hover:text-neutral-600 border border-dashed border-neutral-200 rounded px-2 py-1.5 text-left"
      >
        + Add Week
      </button>
    </div>
  );
}

// ─── Name Template Form ───────────────────────────────────────────────────────

function NameTemplateForm({
  value,
  onChange,
  onConfirm,
  onCancel,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="border rounded p-3 flex flex-col gap-2">
      <p className="text-xs font-medium">New Template</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 3×/week Strength"
        className="w-full rounded border px-2 py-1 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading || !value.trim()}
          className="flex-1 rounded bg-neutral-800 text-white py-1 text-xs hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="rounded border px-2 py-1 text-xs hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 ${active ? "border-b-2 border-black font-medium" : "text-neutral-500"}`}
    >
      {label}
    </button>
  );
}

function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded px-2 py-2 text-sm hover:bg-neutral-100"
    >
      {session.dayLabel}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-neutral-400">{text}</p>;
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({
  monthCursor,
  setMonthCursor,
  sessionsByDateKey,
  currentClientId,
  onDayClick,
  onSelectSession,
  onDropSession,
  disabled,
}: {
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  sessionsByDateKey: Map<string, Session[]>;
  currentClientId: string;
  onDayClick: (dateKey: string) => void;
  onSelectSession: (sessionId: string) => void;
  onDropSession: (sessionId: string, sourceClientId: string, targetDateKey: string) => void;
  disabled: boolean;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function handleDrop(e: React.DragEvent, key: string) {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const { sessionId, sourceClientId } = data;
      if (sessionId && sourceClientId) onDropSession(sessionId, sourceClientId, key);
    } catch {
      // Ignore bad drag data
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonthCursor(addMonths(monthCursor, -1))} className="text-sm px-2 py-1 hover:bg-neutral-100 rounded">←</button>
        <p className="text-sm font-medium">{monthLabel}</p>
        <button onClick={() => setMonthCursor(addMonths(monthCursor, 1))} className="text-sm px-2 py-1 hover:bg-neutral-100 rounded">→</button>
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
              onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, key)}
            >
              <span className="text-neutral-500">{date.getDate()}</span>
              {daySessions.length > 0 ? (
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ sessionId: daySessions[0].id, sourceClientId: currentClientId })
                    );
                  }}
                  className="mt-auto"
                >
                  <button
                    onClick={() => onSelectSession(daySessions[0].id)}
                    className="w-full truncate rounded bg-neutral-800 text-white px-1 py-0.5 text-left cursor-grab active:cursor-grabbing"
                    title={daySessions[0].dayLabel}
                  >
                    {daySessions[0].dayLabel}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onDayClick(key)}
                  disabled={disabled}
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

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
