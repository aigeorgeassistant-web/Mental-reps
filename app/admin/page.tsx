"use client";
// app/admin/page.tsx rendered via AdminPage component

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "ai.george.assistant@gmail.com";

type Coach = { id: string; name: string; email: string; authUserId: string; createdAt: string; _count?: { clients: number } };
type Client = { id: string; name: string; email: string; authUserId: string | null; coachId: string; units: string; createdAt: string; coach: { name: string } };

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as React.CSSProperties,
  label: { fontSize: 11, color: "#888", marginBottom: 3, display: "block" } as React.CSSProperties,
  input: { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" } as React.CSSProperties,
  btn: (variant: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties => ({
    fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", border: "none",
    background: variant === "primary" ? "#1a1a1a" : variant === "danger" ? "#ef4444" : "#f3f4f6",
    color: variant === "ghost" ? "#555" : "#fff",
  }),
  tag: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#555" } as React.CSSProperties,
};

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddForm({ title, coaches, onSave, onCancel }: {
  title: string;
  coaches?: Coach[];
  onSave: (data: { name: string; email: string; password: string; coachId?: string }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachId, setCoachId] = useState(coaches?.[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const err = await onSave({ name, email, password, coachId: coachId || undefined });
    if (err) { setError(err); setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{title}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={S.label}>Name *</label><input style={S.input} value={name} onChange={e => setName(e.target.value)} required /></div>
        <div><label style={S.label}>Email *</label><input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div><label style={S.label}>Temporary password *</label><input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></div>
        {coaches && (
          <div>
            <label style={S.label}>Assign to coach *</label>
            <select style={{ ...S.input }} value={coachId} onChange={e => setCoachId(e.target.value)} required>
              {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {error && <p style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} style={S.btn("ghost")}>Cancel</button>
        <button type="submit" disabled={saving} style={{ ...S.btn("primary"), opacity: saving ? 0.5 : 1 }}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"coaches" | "clients">("coaches");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [addingCoach, setAddingCoach] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user?.email !== ADMIN_EMAIL) { router.replace("/"); return; }
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => { if (authChecked) load(); }, [authChecked]);

  async function load() {
    setLoading(true);
    const [c, cl] = await Promise.all([
      fetch("/api/admin/coaches").then(r => r.json()),
      fetch("/api/admin/clients").then(r => r.json()),
    ]);
    setCoaches(c.coaches ?? []);
    setClients(cl.clients ?? []);
    setLoading(false);
  }

  async function addCoach({ name, email, password }: { name: string; email: string; password: string; coachId?: string }) {
    const res = await fetch("/api/admin/coaches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const d = await res.json();
    if (!res.ok) return d.error ?? "Failed";
    setAddingCoach(false);
    load();
    return null;
  }

  async function addClient({ name, email, password, coachId }: { name: string; email: string; password: string; coachId?: string }) {
    if (!coachId) return "Select a coach";
    const res = await fetch("/api/admin/clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, coachId }),
    });
    const d = await res.json();
    if (!res.ok) return d.error ?? "Failed";
    setAddingClient(false);
    load();
    return null;
  }

  async function deleteCoach(id: string) {
    if (!confirm("Delete this coach and all their data?")) return;
    setDeletingId(id);
    await fetch(`/api/admin/coaches/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  async function deleteClient(id: string) {
    if (!confirm("Delete this client?")) return;
    setDeletingId(id);
    await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  async function reassignClient(clientId: string, coachId: string) {
    setReassigning(clientId);
    await fetch(`/api/admin/clients/${clientId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachId }),
    });
    setReassigning(null);
    load();
  }

  if (!authChecked) return null;

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1a1a1a", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>⚙️ Mental Reps Admin</span>
        <button onClick={() => router.push("/coach/clients")} style={{ ...S.btn("ghost"), background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 12 }}>
          ← Back to app
        </button>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Coaches", value: coaches.length, icon: "🏋️" },
            { label: "Clients", value: clients.length, icon: "👤" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#1a1a1a" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 20 }}>
          {(["coaches", "clients"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 20px", fontSize: 13, fontWeight: tab === t ? 600 : 400,
              border: "none", background: "none", cursor: "pointer",
              borderBottom: tab === t ? "2px solid #1a1a1a" : "2px solid transparent",
              color: tab === t ? "#1a1a1a" : "#888", fontFamily: "inherit", textTransform: "capitalize",
            }}>
              {t} ({t === "coaches" ? coaches.length : clients.length})
            </button>
          ))}
        </div>

        {loading && <p style={{ color: "#888", fontSize: 13 }}>Loading…</p>}

        {/* ── Coaches tab ── */}
        {!loading && tab === "coaches" && (
          <>
            {addingCoach
              ? <AddForm title="Add coach" onSave={addCoach} onCancel={() => setAddingCoach(false)} />
              : <button onClick={() => setAddingCoach(true)} style={{ ...S.btn("primary"), marginBottom: 16 }}>+ Add coach</button>
            }
            {coaches.length === 0 && <p style={{ fontSize: 13, color: "#888" }}>No coaches yet.</p>}
            {coaches.map(c => (
              <div key={c.id} style={S.card}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={S.tag}>{clients.filter(cl => cl.coachId === c.id).length} clients</span>
                  <button
                    onClick={() => deleteCoach(c.id)}
                    disabled={deletingId === c.id}
                    style={{ ...S.btn("danger"), opacity: deletingId === c.id ? 0.5 : 1, fontSize: 11, padding: "4px 10px" }}
                  >
                    {deletingId === c.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Clients tab ── */}
        {!loading && tab === "clients" && (
          <>
            {addingClient
              ? <AddForm title="Add client" coaches={coaches} onSave={addClient} onCancel={() => setAddingClient(false)} />
              : <button onClick={() => setAddingClient(true)} style={{ ...S.btn("primary"), marginBottom: 16 }}>+ Add client</button>
            }
            {clients.length === 0 && <p style={{ fontSize: 13, color: "#888" }}>No clients yet.</p>}
            {clients.map(cl => (
              <div key={cl.id} style={S.card}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{cl.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{cl.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select
                    value={cl.coachId}
                    disabled={reassigning === cl.id}
                    onChange={e => reassignClient(cl.id, e.target.value)}
                    style={{ fontSize: 11, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                  >
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    onClick={() => deleteClient(cl.id)}
                    disabled={deletingId === cl.id}
                    style={{ ...S.btn("danger"), opacity: deletingId === cl.id ? 0.5 : 1, fontSize: 11, padding: "4px 10px" }}
                  >
                    {deletingId === cl.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
