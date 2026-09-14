"use client";
// components/coach/CoachBottomMenu.tsx
// Fixed bottom-left ··· menu for coach pages. Expands upward.
// Always includes Sign Out; extra nav links passed in per-page.

import { useState } from "react";
import { SignOutButton } from "@/components/shared/SignOutButton";

type MenuLink = { href: string; label: string };

export function CoachBottomMenu({ links = [] }: { links?: MenuLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {open && (
        <div className="mb-2 flex flex-col gap-0.5 rounded-lg border bg-white p-1 shadow-md min-w-[160px]">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              {l.label}
            </a>
          ))}
          {links.length > 0 && <div className="h-px bg-neutral-200 my-0.5" />}
          <SignOutButton className="rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors text-left">
            Sign out
          </SignOutButton>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border bg-white text-neutral-500 shadow-sm hover:bg-neutral-50 transition-colors text-lg tracking-wider"
      >
        ···
      </button>
    </div>
  );
}
