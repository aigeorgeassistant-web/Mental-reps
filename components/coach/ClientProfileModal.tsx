"use client";
// components/coach/ClientProfileModal.tsx
// Popup overlay showing a client's profile (email, phone, health/mobility
// notes, general notes, equipment access). Edit button top-right toggles
// an edit form. X or clicking outside closes back to the 3-panel view.

import { useState } from "react";
import { useRouter } from "next/navigation";

const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Bodyweight",
  "Bands",
  "Kettlebell",
  "Bench",
];

type ClientProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  healthNotes: string | null;
  generalNotes: string | null;
  equipment: string[];
  birthday: string | Date | null;
};

function toDateInputValue(d: string | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatBirthdayDisplay(d: string | Date | null): string {
  if (!d) return "Not set";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "Not set";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ClientProfileModal({
  client,
  onClose,
}: {
  client: ClientProfile;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [healthNotes, setHealthNotes] = useState(client.healthNotes ?? "");
  const [generalNotes, setGeneralNotes] = useState(client.generalNotes ?? "");
  const [equipment, setEquipment] = useState<string[]>(client.equipment ?? []);
  const [birthday, setBirthday] = useState<string>(toDateInputValue(client.birthday));

  function toggleEquipment(item: string) {
    setEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    );
  }

  function cancelEdit() {
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setHealthNotes(client.healthNotes ?? "");
    setGeneralNotes(client.generalNotes ?? "");
    setEquipment(client.equipment ?? []);
    setBirthday(toDateInputValue(client.birthday));
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, healthNotes, generalNotes, equipment, birthday: birthday || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        setSaving(false);
        return;
      }
      setSaving(false);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: 380, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15 }}>{client.name}</p>
            <p style={{ fontSize: 11, color: "#888" }}>Client details</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#1a1a1a", fontWeight: 500 }}
              >
                Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Email */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</p>
            {editing ? (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            ) : (
              <p style={{ fontSize: 13, color: client.email ? "#1a1a1a" : "#aaa" }}>{client.email || "Not set"}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Phone</p>
            {editing ? (
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+965 5555 5555"
                style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            ) : (
              <p style={{ fontSize: 13, color: client.phone ? "#1a1a1a" : "#aaa" }}>{client.phone || "Not set"}</p>
            )}
          </div>

          {/* Birthday */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Birthday</p>
            {editing ? (
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            ) : (
              <p style={{ fontSize: 13, color: client.birthday ? "#1a1a1a" : "#aaa" }}>{formatBirthdayDisplay(client.birthday)}</p>
            )}
          </div>

          {/* Health / mobility notes (injuries live here) */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Health / mobility notes</p>
            {editing ? (
              <textarea
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                rows={3}
                placeholder="e.g. low ankle mobility, past ACL injury"
                style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
              />
            ) : (
              <p style={{ fontSize: 13, color: client.healthNotes ? "#1a1a1a" : "#aaa", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{client.healthNotes || "None noted"}</p>
            )}
          </div>

          {/* General notes */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>General notes</p>
            {editing ? (
              <textarea
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                rows={3}
                placeholder="e.g. prefers evening sessions"
                style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
              />
            ) : (
              <p style={{ fontSize: 13, color: client.generalNotes ? "#1a1a1a" : "#aaa", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{client.generalNotes || "None noted"}</p>
            )}
          </div>

          {/* Equipment */}
          <div>
            <p style={{ fontSize: 10, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Equipment access</p>
            {editing ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {EQUIPMENT.map((item) => (
                  <label key={item} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={equipment.includes(item)}
                      onChange={() => toggleEquipment(item)}
                    />
                    {item}
                  </label>
                ))}
              </div>
            ) : client.equipment.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {client.equipment.map((item) => (
                  <span key={item} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, background: "#f3f4f6", color: "#555" }}>{item}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#aaa" }}>None noted</p>
            )}
          </div>

          {error && <p style={{ fontSize: 11, color: "#ef4444" }}>{error}</p>}

          {editing && (
            <div style={{ display: "flex", gap: 8, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
              <button
                onClick={cancelEdit}
                disabled={saving}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#1a1a1a", fontSize: 13, fontWeight: 500, opacity: saving ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

