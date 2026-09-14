"use client";
// components/coach/ProgramBuilder.tsx
// monthCursor lifted so left + right panels stay in sync.
// Client sessions fetched via API on click so loggedSets are included.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";
import { BuilderLeftPanel } from "./BuilderLeftPanel";
import { SessionEditor } from "./SessionEditor";
import { BuilderRightPanel } from "./BuilderRightPanel";
import { addExerciseToSession } from "@/lib/actions/add-exercise-actions";
import { authClient } from "@/lib/auth/client";

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

type OptimisticRow = SessionExercise & { exercise: Exercise; _optimistic: true };

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
  const [selectedTemplateSession, setSelectedTemplateSession] = useState<FullSession | null>(null);
  const [fetchedClientSession, setFetchedClientSession] = useState<FullSession | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [loggedDateKeys, setLoggedDateKeys] = useState<Set<string>>(new Set());

  const [optimisticState, setOptimisticState] = useState<
    Record<string, { rows: OptimisticRow[]; expectedCount: number }>
  >({});

  const [, startTransition] = useTransition();
  const router = useRouter();

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

  // Clear optimistic rows when server catches up
  useEffect(() => {
    if (!selectedClientSession) return;
    const state = optimisticState[selectedClientSession.id];
    if (!state) return;
    if (selectedClientSession.sessionExercises.length >= state.expectedCount) {
      setOptimisticState((prev) => {
        const next = { ...prev };
        delete next[selectedClientSession.id];
        return next;
      });
    }
  }, [selectedClientSession?.sessionExercises.length, selectedClientSession?.id]);

  const sessionWithOptimistic: FullSession | null = sessionForEditor
    ? {
        ...sessionForEditor,
        sessionExercises: [
          ...sessionForEditor.sessionExercises,
          ...(optimisticState[sessionForEditor.id]?.rows ?? []),
        ],
      }
    : null;

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

  // ─── Exercise add — optimistic ─────────────────────────────────────────────────────────

  function handleSelectExercise(exerciseId: string) {
    const targetSessionId = selectedSessionId ?? selectedTemplateSession?.id ?? null;
    const isTemplateSession = !selectedSessionId && !!selectedTemplateSession;
    if (!targetSessionId) return;

    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;

    const currentSession = sessionForEditor;
    const serverCount = currentSession?.sessionExercises.length ?? 0;
    const currentOptimistic = optimisticState[targetSessionId];
    const pendingCount = currentOptimistic?.rows.length ?? 0;
    const order = serverCount + pendingCount;
    const newExpectedCount = serverCount + pendingCount + 1;

    const optimisticRow: OptimisticRow = {
      id: "__optimistic_" + Date.now() + "_" + Math.random(),
      sessionId: targetSessionId,
      exerciseId,
      exercise,
      order,
      sets: null,
      reps: null,
      setType: "FIXED_REPS",
      loadType: "FIXED",
      loadValue: null,
      loadUnit: null,
      coachNote: null,
      target: null,
      groupId: null,
      groupColor: null,
      isRandomizerSlot: false,
      slotPoolExerciseIds: [],
      rpeEnabled: false,
      restSeconds: null,
      _optimistic: true,
    };

    setOptimisticState((prev) => ({
      ...prev,
      [targetSessionId]: {
        rows: [...(prev[targetSessionId]?.rows ?? []), optimisticRow],
        expectedCount: newExpectedCount,
      },
    }));

    startTransition(async () => {
      await addExerciseToSession(targetSessionId, exerciseId);
      if (isTemplateSession && selectedTemplateSession) {
        const data = await fetchSession(selectedTemplateSession.id);
        if (data) setSelectedTemplateSession(data);
      } else if (selectedSessionId) {
        const data = await fetchSession(selectedSessionId);
        if (data) setFetchedClientSession(data);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  const [, setPasteNewExerciseName] = useState<string | null>(null);
  const [, setPasteOnCreated] = useState<((ex: Exercise) => void) | null>(null);

  function handleOpenAddExercise(name: string, onCreated: (ex: Exercise) => void) {
    setPasteNewExerciseName(name);
    setPasteOnCreated(() => onCreated);
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────────────────

  async function handleLogout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.push("/sign-in");
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
        onSelectTemplateSession={handleSelectTemplateSession}
        onExitTemplateMode={handleExitTemplateMode}
      />

      {sessionWithOptimistic ? (
        <SessionEditor
          session={sessionWithOptimistic}
          exercises={exercises}
          onSelectExerciseDetail={setSelectedExerciseId}
          isTemplateSession={selectedClientSession === null && fetchedClientSession === null && selectedTemplateSession !== null}
          onAfterMutation={handleAfterMutation}
          onOpenAddExercise={handleOpenAddExercise}
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
        currentClientId={client.id}
        clientName={client.name}
        monthCursor={monthCursor}
        onSelectTemplateSession={handleSelectTemplateSession}
      />

      <div className="fixed bottom-4 left-4 flex flex-col gap-2 z-50">
        <a
          href="/coach/clients"
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          ← Clients
        </a>
        <a
          href="/coach/templates"
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          🏷 Templates
        </a>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-50"
        >
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}