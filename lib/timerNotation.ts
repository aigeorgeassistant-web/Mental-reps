// Ported from the legacy app's parseIntervalTarget, plus the EMOM-with-reps
// extension speced in SPEC.md §7. This is the ONLY place that should ever
// parse/build a `target` string — keep the coach builder and the client
// session player both importing from here so the notation never drifts.
//
// CHANGE (2026-09-01): buildIntervalTarget's `rounds` param is now
// optional. This is needed for Circuit groups — only the first exercise
// in a circuit carries the round count (e.g. "40/20x3"), every other
// exercise in that circuit just carries its own work/rest ("40/20") with
// no round count. Parsing was already fine with this (the regex's round
// group was already optional) — only the builder needed to catch up.
// Existing callers that always pass rounds are unaffected.
export type ParsedTarget =
  | { kind: "straight" }
  | { kind: "interval"; workSec: number; restSec: number; rounds: number | null }
  | { kind: "emom"; roundSec: number; reps: number | null };

export function parseIntervalTarget(target: string | null | undefined): ParsedTarget {
  if (!target) return { kind: "straight" };
  const emomMatch = target.match(/^EMOM(\d+)(?:x(\d+))?$/i);
  if (emomMatch) {
    return {
      kind: "emom",
      roundSec: parseInt(emomMatch[1], 10),
      reps: emomMatch[2] ? parseInt(emomMatch[2], 10) : null,
    };
  }
  const intervalMatch = target.match(/^(\d+)\/(\d+)(?:x(\d+))?$/);
  if (intervalMatch) {
    return {
      kind: "interval",
      workSec: parseInt(intervalMatch[1], 10),
      restSec: parseInt(intervalMatch[2], 10),
      rounds: intervalMatch[3] ? parseInt(intervalMatch[3], 10) : null,
    };
  }
  return { kind: "straight" };
}

export function buildIntervalTarget(workSec: number, restSec: number, rounds?: number): string {
  return rounds ? `${workSec}/${restSec}x${rounds}` : `${workSec}/${restSec}`;
}

export function buildEmomTarget(roundSec: number, reps?: number): string {
  return reps ? `EMOM${roundSec}x${reps}` : `EMOM${roundSec}`;
}

// Circuit groups share a color but each row can carry its own target;
// this resolves a specific exercise's effective timer, falling back to
// the first exercise in the group if this row has none — matches the
// legacy app's startCircuitTimer behavior exactly.
export function resolveGroupTarget(
  exerciseTarget: string | null | undefined,
  firstInGroupTarget: string | null | undefined,
): ParsedTarget {
  const own = parseIntervalTarget(exerciseTarget);
  if (own.kind !== "straight") return own;
  return parseIntervalTarget(firstInGroupTarget);
}
