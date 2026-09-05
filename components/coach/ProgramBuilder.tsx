"use client";
// components/coach/ProgramBuilder.tsx
// monthCursor lifted so left + right panels stay in sync.
// Handles both client sessions (pre-loaded) and template sessions (fetched on demand).
// Optimistic exercise add: appends a fake row immediately on click, server catches up.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";
import { BuilderLeftPanel } from "./BuilderLeftPanel";
import { SessionEditor } from "./SessionEditor";
import { BuilderRightPanel } from "./BuilderRightPanel";
import { addExerciseToSession } from "@/lib/actions/add-exercise-actions";
import { authClient } from "@/lib/auth/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientWithPrograms = Client & {
  programs: (Program & {
    sessions: (Session & {
      sessionExercises: (SessionExercise & { exercise: Exercise })[];
    })[];
  })[];
};

type FullSession = Session & {
  sessionExercises: (SessionExercise & { exercise: Exercise })[];
};

type OptimisticRow = SessionExercise & { exercise: Exercise; _optimistic: true };

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [loggingOut, setLoggingOut] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  // Optimistic rows keyed by sessionId
  const [optimisticRows, setOptimisticRows] = useState<Record<string, OptimisticRow[]>>({});

  const [, startTransition] = useTransition();
  const router = useRouter();

  const program = client.programs[0];
  const selectedClientSession = program?.sessions.find((s) => s.id === selectedSessionId) ?? null;
  const sessionForEditor: FullSession | null = selectedClientSession ?? selectedTemplateSession;

  // Merge optimistic rows into the session before passing to SessionEditor
  const sessionWithOptimistic: FullSession | null = sessionForEditor
    ? {
        ...sessionForEditor,
        sessionExercises: [
          ...sessionForEditor.sessionExercises,
          ...(optimisticRows[sessionForEditor.id] ?? []),
        ],
      }
    : null;

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) ?? null;

  // ─── Fetch template session from API ────────────────────────────────────────

  async function fetchTemplateSession(sessionId: string) {
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}`);
      if (res.ok) {
        const data: FullSession = await res.json();
        setSelectedTemplateSession(data);
        // Clear optimistic rows for this session — server data is now fresh
        setOptimisticRows((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      }
    } catch {
      // Silent fail
    }
  }

  // ─── Session selection handlers ─────────────────────────────────────────────

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSelectedTemplateSession(null);
  }

  async function handleSelectTemplateSession(sessionId: string) {
    setSelectedSessionId(null);
    await fetchTemplateSession(sessionId);
  }

  function handleExitTemplateMode() {
    setSelectedTemplateSession(null);
  }

  // ─── Exercise add — optimistic ───────────────────────────────────────────────

  function handleSelectExercise(exerciseId: string) {
    const targetSessionId = selectedSessionId ?? selectedTemplateSession?.id ?? null;
    const isTemplateSession = !selectedSessionId && !!selectedTemplateSession;
    if (!targetSessionId) return;

    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;

    // Current row count = server rows + optimistic rows already pending
    const currentSession = sessionForEditor;
    const serverCount = currentSession?.sessionExercises.length ?? 0;
    const pendingCount = (optimisticRows[targetSessionId] ?? []).length;
    const order = serverCount + pendingCount;

    // Build optimistic row — fake id so React has a key
    const optimisticRow: OptimisticRow = {
      id: `__optimistic_${Date.now()}_${Math.random()}`,
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

    // Append optimistic row immediately
    setOptimisticRows((prev) => ({
      ...prev,
      [targetSessionId]: [...(prev[targetSessionId] ?? []), optimisticRow],
    }));

    startTransition(async () => {
      await addExerciseToSession(targetSessionId, exerciseId);
      if (isTemplateSession && selectedTemplateSession) {
        await fetchTemplateSession(selectedTemplateSession.id);
      } else {
        // router.refresh() brings real data — optimistic rows are cleared
        // only after server data arrives (React reconciles by real ids)
        router.refresh();
      }
    });
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async function handleLogout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.push("/sign-in");
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen relative">
      <BuilderLeftPanel
        clientId={client.id}
        client={client}
        program={program}
        exercises={exercises}
        monthCursor={monthCursor}
        setMonthCursor={setMonthCursor}
        onSelectSession={handleSelectSession}
        onSelectExercise={handleSelectExercise}
        onPreviewExercise={setSelectedExerciseId}
        onSelectTemplateSession={handleSelectTemplateSession}
        onExitTemplateMode={handleExitTemplateMode}
      />

      {sessionWithOptimistic ? (
        <SessionEditor
          session={sessionWithOptimistic}
          onSelectExerciseDetail={setSelectedExerciseId}
          isTemplateSession={selectedClientSession === null && selectedTemplateSession !== null}
          onAfterMutation={
            selectedTemplateSession
              ? () => fetchTemplateSession(selectedTemplateSession.id)
              : undefined
          }
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

      {/* Bottom-left account controls */}
      <div className="fixed bottom-4 left-4 flex flex-col gap-2 z-50">
        <a
          href="/coach/clients"
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium text-neutral-600 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          ← Clients
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
