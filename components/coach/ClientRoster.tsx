"use client";
// components/coach/ClientRoster.tsx
// Client roster with search + 3 grouping filters (Favourites/Active/Inactive).
// Filters never hide anyone — they just bring matching clients to the top,
// with a divider line marking where the rest of the list begins.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Client } from "@prisma/client";
import { InviteButton } from "@/components/coach/InviteButton";

type Tab = "favourites" | "active" | "inactive" | null;

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function ClientRoster({ clients: initialClients }: { clients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [tab, setTab] = useState<Tab>(null);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function patchClient(id: string, data: Partial<Pick<Client, "favourite" | "status">>) {
    const prev = clients;
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...data } : c)));
    setSavingId(id);
    try {
      const res = await fetch(`/api/coach/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) setClients(prev);
    } catch {
      setClients(prev);
    } finally {
      setSavingId(null);
    }
  }

  function toggleFavourite(c: Client) {
    patchClient(c.id, { favourite: !c.favourite });
  }

  function toggleStatus(c: Client) {
    patchClient(c.id, { status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
  }

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, search]);

  const { grouped, rest } = useMemo(() => {
    if (!tab) return { grouped: [] as Client[], rest: searched };
    const matches = (c: Client) =>
      tab === "favourites" ? c.favourite : tab === "active" ? c.status === "ACTIVE" : c.status === "INACTIVE";
    return {
      grouped: searched.filter(matches),
      rest: searched.filter((c) => !matches(c)),
    };
  }, [searched, tab]);

  function TabButton({ value, label }: { value: Exclude<Tab, null>; label: string }) {
    const active = tab === value;
    return (
      <button
        onClick={() => setTab(active ? null : value)}
        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
          active
            ? "bg-neutral-900 text-white border-neutral-900"
            : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
        }`}
      >
        {label}
      </button>
    );
  }

  function ClientRow({ c }: { c: Client }) {
    return (
      <div className="flex items-center gap-3 p-3 hover:bg-neutral-50">
        <button
          onClick={() => toggleFavourite(c)}
          disabled={savingId === c.id}
          title={c.favourite ? "Remove from favourites" : "Add to favourites"}
          className={`shrink-0 text-base leading-none ${c.favourite ? "text-amber-400" : "text-neutral-300 hover:text-amber-300"}`}
        >
          {c.favourite ? "★" : "☆"}
        </button>

        <Link href={`/coach/clients/${c.id}/builder`} className="flex flex-1 items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium shrink-0">
            {initials(c.name)}
          </div>
          <span className="flex-1 text-sm truncate">{c.name}</span>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => toggleStatus(c)}
            disabled={savingId === c.id}
            title="Click to toggle"
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              c.status === "ACTIVE"
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            }`}
          >
            {c.status === "ACTIVE" ? "Active" : "Inactive"}
          </button>

          {c.authUserId ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700 font-medium">
              Logged in
            </span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 font-medium">
              No login
            </span>
          )}

          {c.authUserId ? (
            <Link
              href={`/coach/clients/${c.id}/edit`}
              className="rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-100 transition-colors"
            >
              Edit
            </Link>
          ) : (
            <InviteButton clientId={c.id} clientName={c.name} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="flex-1 min-w-[160px] rounded-md border px-3 py-1.5 text-sm"
        />
        <TabButton value="favourites" label="★ Favourites" />
        <TabButton value="active" label="Active" />
        <TabButton value="inactive" label="Inactive" />
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {tab ? (
          <>
            {grouped.map((c) => <ClientRow key={c.id} c={c} />)}
            {grouped.length > 0 && rest.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50">
                <div className="flex-1 h-px bg-neutral-200" />
                <span className="text-[10px] text-neutral-400 uppercase tracking-wide">Other clients</span>
                <div className="flex-1 h-px bg-neutral-200" />
              </div>
            )}
            {rest.map((c) => <ClientRow key={c.id} c={c} />)}
          </>
        ) : (
          searched.map((c) => <ClientRow key={c.id} c={c} />)
        )}
        {searched.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">No clients match.</p>
        )}
      </div>
    </div>
  );
}
