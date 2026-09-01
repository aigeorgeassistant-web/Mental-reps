"use client";

// This is a STATIC PLACEHOLDER, not the finished builder.
// The full interactive design (Month grid, drag-select superset painting,
// per-exercise timer overrides, cross-client browse/copy) was built and
// tested as chat prototypes during design — port that behavior here rather
// than redesigning from scratch. See SPEC.md §6 and §14 for exact specs
// and which prototype to reference for each piece.
//
// Remaining work, in the order it was originally built and tested:
//   1. Left panel: Month/Exercises tabs, month grid, exercise picker+search
//   2. Center panel: session list, drag-handle reorder, drag-select superset
//      painting with color popup, sets/reps scroll-picker + manual entry
//   3. Straight-vs-timed assignment (Interval/EMOM/Circuit inputs) writing
//      `target` strings via lib/timerNotation.ts — never hand-build these
//      strings elsewhere
//   4. Right panel: Detail/Browse-clients tabs, sparkline + log history,
//      cross-client drag with displaced/floating + trash-bin delete
//   5. Wire all of the above to real Prisma mutations (currently everything
//      here is presentational only, no server actions yet)

import type { Client, Exercise, Program, Session, SessionExercise } from "@prisma/client";

type ClientWithPrograms = Client & {
  programs: (Program & {
    sessions: (Session & {
      sessionExercises: (SessionExercise & { exercise: Exercise })[];
    })[];
  })[];
};

export function ProgramBuilder({
  client,
  exercises,
}: {
  client: ClientWithPrograms;
  exercises: Exercise[];
}) {
  return (
    <div className="flex min-h-screen">
      <div className="w-1/4 border-r p-4">
        <p className="text-sm font-medium">{client.name}</p>
        <p className="mt-2 text-xs text-neutral-500">
          Month / Exercises tabs go here — see SPEC.md §6.
        </p>
      </div>
      <div className="w-1/2 border-r p-4">
        <p className="text-xs text-neutral-500">
          Active session editor goes here. {exercises.length} exercises available.
        </p>
      </div>
      <div className="w-1/4 p-4">
        <p className="text-xs text-neutral-500">
          Exercise detail / Browse clients tabs go here.
        </p>
      </div>
    </div>
  );
}
