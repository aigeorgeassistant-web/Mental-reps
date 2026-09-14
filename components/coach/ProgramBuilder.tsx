"use client";
// components/coach/ProgramBuilder.tsx
// monthCursor lifted so left + right panels stay in sync.
// Client sessions fetched via API on click so loggedSets are included.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";
import { BuilderLeftPanel } from "./BuilderLeftPanel";
import { SessionEditor } from "./SessionEditor";
import { BuilderRightPanel } from "./BuilderRightPanel";
import { CoachBottomMenu } from "./CoachBottomMenu";

// ─── Types ────────────────────────────────────────────────────────────────────────────────

type ClientWithPrograms = Client & {
  programs: (Program & {
    sessions: (Session & {
      sessionExercises: (SessionExercise & { exercise: Exercise })[];
    })[];
  })[];
};

type LoggedSetData = { setIndex: number; weight: number | null; reps: number | null; notes: string | null };

type FullSession = Session & {
  sessionExercises: (SessionExercise & { exercise: Exercise; loggedSets?: LoggedSetData[] })[];
  checkIn?: { sleep: number | null; mood: number | null; hydration: number | null; stress: number | null } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

function monthKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function dateKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ─── Component ────────────────────────────────────────────────────────────────────────────

export function ProgramBuilder({
  client,
  exercises,
}: {
  client: ClientWithPrograms;
  exercises: Exercise[];
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [selectedTemplateSession, setSelectedTemplateSession] = useState<FullSession | null>(null);
  const [fetchedClientSession, setFetchedClientSession] = useState<FullSession | null>(null);
  const [monthCursor, setMonthCursor] = useState<Date>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [loggedDateKeys, setLoggedDateKeys] = useState<Set<string>>(new Set());


  const [, startTransition] = useTransition();
  const router = useRouter();
  const sessionEditorAddRef = useRef<((exerciseId: string) => void) | null>(null);

  const program = client.programs[0];
  const selectedClientSession = program?.sessions.find((s) => s.id === selectedSessionId) ?? null;
  const sessionForEditor: FullSession | null =
    fetchedClientSession ?? selectedClientSession ?? selectedTemplateSession;

  // Fetch logged date keys whenever month changes
  useEffect(() => {
    if (!client.id) return;
    const mk = monthKey(monthCursor);
    fetch("/api/coach/clients/" + client.id + "/sessions?month=" + mk)
      .then((r) => r.json())
      .then((data: Array<{ id: string; date: string; _hasLogs?: boolean }>) => {
        const keys = new Set<string>();
        for (const s of data) {
          if (s._hasLogs && s.date) {
            keys.add(dateKey(new Date(s.date)));
          }
        }
        setLoggedDateKeys(keys);
      })
      .catch(() => {});
  }, [client.id, monthCursor]);


  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) ?? null;

  // ─── Fetch session via API ──────────────────────────────────────────────────────

  async function fetchSession(sessionId: string): Promise<FullSession | null> {
    try {
      const res = await fetch("/api/coach/sessions/" + sessionId);
      if (res.ok) return res.json();
    } catch {}
    return null;
  }

  async function refreshLoggedKeys() {
    const mk = monthKey(monthCursor);
    fetch("/api/coach/clients/" + client.id + "/sessions?month=" + mk)
      .then((r) => r.json())
      .then((data: Array<{ id: string; date: string; _hasLogs?: boolean }>) => {
        const keys = new Set<string>();
        for (const s of data) {
          if (s._hasLogs && s.date) keys.add(dateKey(new Date(s.date)));
        }
        setLoggedDateKeys(keys);
      })
      .catch(() => {});
  }

  // ─── Session selection ───────────────────────────────────────────────────────────────

  async function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSelectedTemplateSession(null);
    setFetchedClientSession(null);
    const full = await fetchSession(sessionId);
    if (full) setFetchedClientSession(full);
  }

  async function handleSelectTemplateSession(sessionId: string) {
    setSelectedSessionId(null);
    setFetchedClientSession(null);
    const data = await fetchSession(sessionId);
    if (data) setSelectedTemplateSession(data);
  }

  function handleExitTemplateMode() {
    setSelectedTemplateSession(null);
  }

  // ─── After mutation ───────────────────────────────────────────────────────────────────

  async function handleAfterMutation() {
    // Row/group/detail edits inside an already-open session only need this
    // session's own data re-fetched (which already includes loggedSets) —
    // not a full page refresh. router.refresh() is reserved for actions
    // that change which sessions exist (create/move/delete/copy), which
    // already trigger it themselves in BuilderLeftPanel.
    if (selectedTemplateSession) {
      const data = await fetchSession(selectedTemplateSession.id);
      if (data) setSelectedTemplateSession(data);
    } else if (selectedSessionId) {
      const data = await fetchSession(selectedSessionId);
      if (data) setFetchedClientSession(data);
      refreshLoggedKeys();
    }
  }

  // ─── Exercise add — delegated to SessionEditor ──────────────────────────────────────────

  function handleSelectExercise(exerciseId: string) {
    // SessionEditor owns optimistic state. We just need to know which session is open.
    // The actual server call + optimistic row management happens inside SessionEditor
    // via the onAddExercise prop.
    if (!sessionForEditor) return;
    // Signal SessionEditor to add this exercise
    sessionEditorAddRef.current?.(exerciseId);
  }

  const [, setPasteNewExerciseName] = useState<string | null>(null);
  const [, setPasteOnCreated] = useState<((ex: Exercise) => void) | null>(null);

  function handleOpenAddExercise(name: string, onCreated: (ex: Exercise) => void) {
    setPasteNewExerciseName(name);
    setPasteOnCreated(() => onCreated);
  }

  // ─── Render ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen relative">
      <BuilderLeftPanel
        clientId={client.id}
        client={client}
        program={program}
        exercises={exercises}
        monthCursor={monthCursor}
        setMonthCursor={setMonthCursor}
        loggedDateKeys={loggedDateKeys}
        onSelectSession={handleSelectSession}
        onSelectExercise={handleSelectExercise}
        onPreviewExercise={setSelectedExerciseId}
        onRequestAddExercise={() => { setShowAddExercise(true); setSelectedExerciseId(null); }}
        onSelectTemplateSession={handleSelectTemplateSession}
        onExitTemplateMode={handleExitTemplateMode}
      />

      {sessionForEditor ? (
        <SessionEditor
          session={sessionForEditor}
          exercises={exercises}
          onSelectExerciseDetail={setSelectedExerciseId}
          isTemplateSession={selectedClientSession === null && fetchedClientSession === null && selectedTemplateSession !== null}
          onAfterMutation={handleAfterMutation}
          onOpenAddExercise={handleOpenAddExercise}
          onAddExerciseRef={sessionEditorAddRef}
        />
      ) : (
        <div className="w-1/2 border-r p-4">
          <p className="text-xs text-neutral-500">
            Click a day in the Month tab to open its session here.
          </p>
        </div>
      )}

      <BuilderRightPanel
        exercise={selectedExercise}
        showAddExercise={showAddExercise}
        onDoneAddExercise={() => setShowAddExercise(false)}
        currentClientId={client.id}
        clientName={client.name}
        monthCursor={monthCursor}
        onSelectTemplateSession={handleSelectTemplateSession}
      />

      <CoachBottomMenu
        links={[
          { href: "/coach/clients", label: "← Clients" },
          { href: "/coach/templates", label: "🏷 Templates" },
        ]}
      />
    </div>
  );
}


