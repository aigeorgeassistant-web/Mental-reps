"use client";
// components/coach/ExerciseDrawer.tsx
// Right-edge exercise picker for CoachLiveSession.
// Collapsed = small edge tab. Tap → half-screen drawer with search.
// Hold a row → GIF/webm + muscle-group preview appears.
// Keep holding + drag left, over the session list → insertion line shows
// where it'll land. Release there → inserted. Release anywhere else
// (back over the drawer, off-screen) → cancelled, nothing happens.

import { useRef, useState } from "react";
import type { Exercise } from "@prisma/client";

type DropTarget = { index: number; y: number; left: number; width: number } | null;

export function ExerciseDrawer({
  allExercises,
  resolveDropIndex,
  onDrop,
}: {
  allExercises: Exercise[];
  resolveDropIndex: (x: number, y: number) => DropTarget;
  onDrop: (ex: Exercise, index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ ex: Exercise; x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ ex: Exercise; x: number; y: number } | null>(null);
  const [indicator, setIndicator] = useState<DropTarget>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<{
    ex: Exercise;
    pointerId: number;
    startX: number;
    startY: number;
    holdTimer: ReturnType<typeof setTimeout>;
    holding: boolean;
    dragging: boolean;
    dropIndex: number | null;
  } | null>(null);

  const filtered = allExercises
    .filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);

  function cleanup() {
    if (pendingRef.current) clearTimeout(pendingRef.current.holdTimer);
    pendingRef.current = null;
    setPreview(null);
    setGhost(null);
    setIndicator(null);
  }

  function onRowPointerDown(e: React.PointerEvent, ex: Exercise) {
    const startX = e.clientX;
    const startY = e.clientY;
    const holdTimer = setTimeout(() => {
      const p = pendingRef.current;
      if (!p) return;
      p.holding = true;
      setPreview({ ex, x: startX, y: startY });
    }, 350);
    pendingRef.current = {
      ex, pointerId: e.pointerId, startX, startY,
      holdTimer, holding: false, dragging: false, dropIndex: null,
    };
  }

  function onRowPointerMove(e: React.PointerEvent, rowEl: HTMLElement) {
    const p = pendingRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    if (!p.holding) {
      if (Math.hypot(dx, dy) > 26) cleanup(); // moved before hold fired → treat as scroll
      return;
    }

    if (!p.dragging) {
      p.dragging = true;
      try { rowEl.setPointerCapture(p.pointerId); } catch {}
      setPreview(null);
    }

    setGhost({ ex: p.ex, x: e.clientX, y: e.clientY });

    const drawerLeft = drawerRef.current?.getBoundingClientRect().left ?? Infinity;
    if (e.clientX >= drawerLeft - 4) {
      p.dropIndex = null;
      setIndicator(null);
    } else {
      const target = resolveDropIndex(e.clientX, e.clientY);
      p.dropIndex = target ? target.index : null;
      setIndicator(target);
    }
  }

  function onRowPointerUp(e: React.PointerEvent, ex: Exercise) {
    const p = pendingRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    if (p.dragging && p.dropIndex !== null) {
      onDrop(ex, p.dropIndex);
      setOpen(false);
    }
    cleanup();
  }

  return (
    <>
      {/* Collapsed edge tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
            width: 26, height: 88, borderRadius: "10px 0 0 10px",
            border: "1px solid var(--line)", borderRight: "none",
            background: "var(--panel)", color: "var(--dim)",
            fontSize: 16, letterSpacing: 2, zIndex: 250, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            writingMode: "vertical-rl",
          }}
        >
          ⋯
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div
          ref={drawerRef}
          style={{
            position: "fixed", right: 0, top: 0, bottom: 0, width: "56%", maxWidth: 300,
            background: "var(--panel)", borderLeft: "1px solid var(--line)",
            zIndex: 250, display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 24px rgba(0,0,0,.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 8px" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Exercises</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 18, cursor: "pointer" }}>›</button>
          </div>
          <div style={{ padding: "0 12px 8px" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ width: "100%", height: 36, borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontSize: 13, padding: "0 10px", boxSizing: "border-box", outline: "none" }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 12px" }}>
            {filtered.map((ex) => (
              <div
                key={ex.id}
                onPointerDown={(e) => onRowPointerDown(e, ex)}
                onPointerMove={(e) => onRowPointerMove(e, e.currentTarget)}
                onPointerUp={(e) => onRowPointerUp(e, ex)}
                onPointerCancel={cleanup}
                style={{
                  padding: "10px 8px", borderRadius: 9, marginBottom: 2,
                  color: "var(--text)", fontSize: 13, fontWeight: 600,
                  touchAction: "pan-y", userSelect: "none",
                  WebkitUserSelect: "none", WebkitTouchCallout: "none",
                  cursor: "grab",
                }}
              >
                {ex.name}
                {ex.muscleGroups.length > 0 && (
                  <span style={{ display: "block", fontSize: 10, color: "var(--dim)", marginTop: 2, fontWeight: 400 }}>
                    {ex.muscleGroups.slice(0, 3).join(", ")}
                  </span>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", padding: 20 }}>No exercises found</div>
            )}
          </div>
        </div>
      )}

      {/* Hold-preview popup */}
      {preview && (
        <div
          style={{
            position: "fixed", left: "50%", top: "38%", transform: "translate(-50%,-50%)",
            zIndex: 260, background: "var(--panel)", border: "1px solid var(--line)",
            borderRadius: 14, padding: 12, width: 220, pointerEvents: "none",
            boxShadow: "0 8px 28px rgba(0,0,0,.5)",
          }}
        >
          {preview.ex.gifUrl && (
            /\.(webm|mp4)$/i.test(preview.ex.gifUrl) ? (
              <video src={preview.ex.gifUrl} autoPlay loop muted playsInline style={{ width: "100%", borderRadius: 8, marginBottom: 8, background: "var(--bg)" }} />
            ) : (
              <img src={preview.ex.gifUrl} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 8, background: "var(--bg)" }} />
            )
          )}
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{preview.ex.name}</div>
          {preview.ex.muscleGroups.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{preview.ex.muscleGroups.slice(0, 4).join(", ")}</div>
          )}
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8, fontStyle: "italic" }}>Keep holding + drag to add</div>
        </div>
      )}

      {/* Drag ghost */}
      {ghost && (
        <div
          style={{
            position: "fixed", left: ghost.x, top: ghost.y, transform: "translate(-50%,-50%)",
            zIndex: 270, background: "var(--good)", color: "#0c1a10",
            borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 800,
            pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,.4)", opacity: 0.95,
            whiteSpace: "nowrap",
          }}
        >
          {ghost.ex.name}
        </div>
      )}

      {/* Insertion indicator */}
      {indicator && (
        <div
          style={{
            position: "fixed", left: indicator.left, top: indicator.y - 1.5,
            width: indicator.width, height: 3, background: "var(--good)",
            borderRadius: 2, zIndex: 260, pointerEvents: "none",
            boxShadow: "0 0 8px var(--good)",
          }}
        />
      )}
    </>
  );
}
