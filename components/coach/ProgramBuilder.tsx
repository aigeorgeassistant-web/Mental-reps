"use client";
// components/coach/ProgramBuilder.tsx
// monthCursor lifted so left + right panels stay in sync.
// Handles both client sessions (pre-loaded) and template sessions (fetched on demand).

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
  const [, startTransition] = useTransition();
  const router = useRouter();

  const program = client.programs[0];

  // Client program session (pre-loaded by server)
  const selectedClientSession = program?.sessions.find((s) => s.id === selectedSessionId) ?? null;

  // What the center panel shows — client session takes priority if both somehow set
  const sessionForEditor: FullSession | null = selectedClientSession ?? selectedTemplateSession;

  // The exercise shown in the right panel detail tab
  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) ?? null;

  // ─── Fetch template session from API ────────────────────────────────────────

  async function fetchTemplateSession(sessionId: string) {
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}`);
      if (res.ok) {
        const data: FullSession = await res.json();
        setSelectedTemplateSession(data);
      }
    } catch {
      // Silent fail — center panel stays on last valid state
    }
  }

  // ─── Session selection handlers ─────────────────────────────────────────────

  // Client calendar day selected → clear template session
  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSelectedTemplateSession(null);
  }

  // Template day selected → clear client session, fetch template data
  async function handleSelectTemplateSession(sessionId: string) {
    setSelectedSessionId(null);
    await fetchTemplateSession(sessionId);
  }

  // Template builder exited
  function handleExitTemplateMode() {
    setSelectedTemplateSession(null);
  }

  // ─── Exercise add ────────────────────────────────────────────────────────────

  function handleSelectExercise(exerciseId: string) {
    // Work out which session is active: client session or template session
    const targetSessionId = selectedSessionId ?? selectedTemplateSession?.id ?? null;
    const isTemplateSession = !selectedSessionId && !!selectedTemplateSession;
    if (!targetSessionId) return;

    startTransition(async () => {
      await addExerciseToSession(targetSessionId, exerciseId);
      router.refresh();
      // Template sessions aren't in the page's server data — re-fetch manually
      if (isTemplateSession && selectedTemplateSession) {
        await fetchTemplateSession(selectedTemplateSession.id);
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

      {sessionForEditor ? (
        <SessionEditor
          session={sessionForEditor}
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
