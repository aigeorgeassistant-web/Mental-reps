"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  currency: string | null;
  price: number | null;
  discountFlat: number | null;
  discountPercent: number | null;
  discountEndsAt: string | null;
  coach: { name: string };
  sessions: { id: string }[];
};

type BundleTemplate = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
};

type Bundle = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  discountFlat: number | null;
  discountPercent: number | null;
  discountEndsAt: string | null;
  coach: { name: string };
  items: { template: BundleTemplate }[];
};

type CoachClient = {
  id: string;
  name: string;
  email: string;
};

type DiscountType = "pct" | "flat";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function effectivePrice(
  base: number,
  discountFlat: number | null,
  discountPercent: number | null,
  discountEndsAt: string | null
): number {
  const days = daysUntil(discountEndsAt);
  const expired = days !== null && days <= 0;
  if (expired) return base;
  if (discountFlat != null) return Math.max(0, base - discountFlat);
  if (discountPercent != null) return base * (1 - discountPercent / 100);
  return base;
}

function bundleFullPrice(items: { template: BundleTemplate }[]): number {
  return items.reduce((sum, it) => sum + (Number(it.template.price) || 0), 0);
}

// ─── Timer chip ───────────────────────────────────────────────────────────────

function TimerChip({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days <= 0) return (
    <span className="inline-flex items-center gap-1 text-[11px] bg-red-50 text-red-600 rounded px-2 py-0.5">
      Discount expired
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] rounded px-2 py-0.5 ${
      days <= 7 ? "bg-amber-50 text-amber-700" : "bg-amber-50 text-amber-600"
    }`}>
      ⏱ {days <= 7 ? `Ends in ${days} day${days === 1 ? "" : "s"}!` : `Discount ends in ${days} days`}
    </span>
  );
}

// ─── Store Preview ────────────────────────────────────────────────────────────

function StorePreview({
  name, meta, currency, price, discountFlat, discountPercent, discountEndsAt,
  isBundle = false, bundleCount = 0
}: {
  name: string; meta: string; currency: string;
  price: number | null; discountFlat: number | null; discountPercent: number | null;
  discountEndsAt: string | null; isBundle?: boolean; bundleCount?: number;
}) {
  if (price == null || price === 0) {
    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{meta}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-neutral-400 italic">No price — private template</p>
        </div>
      </div>
    );
  }

  const days = daysUntil(discountEndsAt);
  const expired = days !== null && days <= 0;
  const hasDiscount = !expired && (discountFlat != null || discountPercent != null);
  const finalPrice = effectivePrice(price, discountFlat, discountPercent, discountEndsAt);
  const cur = currency || "KWD";

  let badgeText = "";
  if (hasDiscount) {
    if (discountFlat != null) badgeText = `${cur} ${Number(discountFlat).toFixed(2)} off`;
    else if (discountPercent != null) badgeText = `${Math.round(Number(discountPercent))}% off`;
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{name}</p>
          {isBundle && (
            <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">
              {bundleCount} templates
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">{meta}</p>
      </div>
      {hasDiscount && (
        <div className="px-4 pt-2">
          <TimerChip dateStr={discountEndsAt} />
        </div>
      )}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          {hasDiscount ? (
            <>
              <span className="text-xs text-neutral-400 line-through">{cur} {Number(price).toFixed(2)}</span>
              <span className="text-xl font-semibold text-green-600">{cur} {finalPrice.toFixed(2)}</span>
              <span className="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-0.5">{badgeText}</span>
            </>
          ) : (
            <span className="text-xl font-semibold">{cur} {Number(price).toFixed(2)}</span>
          )}
        </div>
        <button className="text-xs bg-neutral-900 text-white rounded px-3 py-1.5">
          {isBundle ? "Buy bundle" : "Buy"}
        </button>
      </div>
    </div>
  );
}

// ─── Discount section (shared by template + bundle editors) ───────────────────

function DiscountSection({
  discountType, setDiscountType,
  discountValue, setDiscountValue,
  discountEndsAt, setDiscountEndsAt,
  currency,
}: {
  discountType: DiscountType; setDiscountType: (t: DiscountType) => void;
  discountValue: string; setDiscountValue: (v: string) => void;
  discountEndsAt: string; setDiscountEndsAt: (v: string) => void;
  currency: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white mb-3">
      <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Discount</p>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-neutral-500 w-20">Type</span>
        <div className="flex border rounded overflow-hidden">
          <button onClick={() => setDiscountType("pct")}
            className={`px-3 py-1.5 text-xs ${discountType === "pct" ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
            %
          </button>
          <button onClick={() => setDiscountType("flat")}
            className={`px-3 py-1.5 text-xs ${discountType === "flat" ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
            flat
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-neutral-500 w-20">Amount</span>
        <div className="flex">
          <span className="text-xs text-neutral-500 px-2 border border-r-0 rounded-l flex items-center bg-neutral-50 h-8">
            {discountType === "pct" ? "%" : currency}
          </span>
          <input type="number" min="0" max={discountType === "pct" ? 100 : undefined}
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            className="w-24 border rounded-r px-2 text-sm h-8"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-500 w-20">Expires</span>
        <input type="date" value={discountEndsAt} onChange={e => setDiscountEndsAt(e.target.value)}
          className="border rounded px-2 text-xs h-8" />
        {discountEndsAt && (
          <button onClick={() => setDiscountEndsAt("")} className="text-xs text-neutral-400 hover:text-neutral-700">
            clear
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Grant Client Picker Modal ────────────────────────────────────────────────

function GrantPicker({
  clients,
  onClose,
  onGrant,
}: {
  clients: CoachClient[];
  onClose: () => void;
  onGrant: (clientId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);

  const filtered = useMemo(
    () => clients.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
    ),
    [clients, search]
  );

  async function handleGrant() {
    if (!selectedId) return;
    setGranting(true);
    await onGrant(selectedId);
    setGranting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-80 shadow-lg border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">Grant free access</p>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">×</button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full border rounded px-2 py-1.5 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto px-2 pb-2">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left hover:bg-neutral-50 ${
                selectedId === c.id ? "bg-neutral-100" : ""
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 border ${
                selectedId === c.id ? "bg-neutral-900 border-neutral-900" : "border-neutral-300"
              }`} />
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="text-xs text-neutral-400">{c.email}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-neutral-400 px-2 py-3">No clients match.</p>
          )}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded text-neutral-500">
            Cancel
          </button>
          <button
            onClick={handleGrant}
            disabled={!selectedId || granting}
            className="px-3 py-1.5 text-xs bg-neutral-900 text-white rounded disabled:opacity-40"
          >
            {granting ? "Granting..." : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Editor ──────────────────────────────────────────────────────────

function TemplateEditor({ template, isAdmin, clients, onSaved }: {
  template: Template; isAdmin: boolean; clients: CoachClient[]; onSaved: (t: Template) => void;
}) {
  const [tab, setTab] = useState<"pricing" | "details">("pricing");
  const [price, setPrice] = useState(template.price != null ? String(template.price) : "");
  const [currency, setCurrency] = useState(template.currency || "KWD");
  const [discountType, setDiscountType] = useState<DiscountType>(
    template.discountFlat != null ? "flat" : "pct"
  );
  const [discountValue, setDiscountValue] = useState(
    template.discountFlat != null ? String(template.discountFlat)
    : template.discountPercent != null ? String(template.discountPercent)
    : ""
  );
  const [discountEndsAt, setDiscountEndsAt] = useState(
    template.discountEndsAt ? template.discountEndsAt.slice(0, 10) : ""
  );
  const [description, setDescription] = useState(template.description || "");
  const [category, setCategory] = useState(template.category || "");
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState(0);
  const [showGrantPicker, setShowGrantPicker] = useState(false);
  const [grantedKey, setGrantedKey] = useState(0);

  useEffect(() => {
    setPrice(template.price != null ? String(template.price) : "");
    setCurrency(template.currency || "KWD");
    setDiscountType(template.discountFlat != null ? "flat" : "pct");
    setDiscountValue(
      template.discountFlat != null ? String(template.discountFlat)
      : template.discountPercent != null ? String(template.discountPercent)
      : ""
    );
    setDiscountEndsAt(template.discountEndsAt ? template.discountEndsAt.slice(0, 10) : "");
    setDescription(template.description || "");
    setCategory(template.category || "");
    setTab("pricing");
  }, [template.id]);

  const discountPayload = discountValue !== ""
    ? (discountType === "flat"
        ? { discountFlat: Number(discountValue), discountPercent: null }
        : { discountPercent: Number(discountValue), discountFlat: null })
    : { discountFlat: null, discountPercent: null };

  async function handleSave() {
    setSaving(true);
    const body: Record<string, unknown> = {
      price: price !== "" ? Number(price) : null,
      currency,
      discountEndsAt: discountEndsAt || null,
      ...discountPayload,
    };
    if (tab === "details") {
      body.description = description;
      body.category = category;
    }
    const res = await fetch(`/api/coach/templates/${template.id}/price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.template) {
      onSaved(data.template);
      setSavedKey(k => k + 1);
    }
    setSaving(false);
  }

  async function handleGrant(clientId: string) {
    const res = await fetch(`/api/coach/templates/${template.id}/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json();
    if (data.ok) {
      setShowGrantPicker(false);
      setGrantedKey(k => k + 1);
    }
  }

  const previewDiscountFlat = discountPayload.discountFlat ?? null;
  const previewDiscountPct = discountPayload.discountPercent ?? null;

  return (
    <div>
      {showGrantPicker && (
        <GrantPicker
          clients={clients}
          onClose={() => setShowGrantPicker(false)}
          onGrant={handleGrant}
        />
      )}

      <div className="mb-3">
        <h2 className="text-base font-medium">{template.name}</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {template.sessions.length} sessions
          {isAdmin && ` · by ${template.coach.name}`}
        </p>
      </div>
      <div className="flex border-b mb-4 text-xs">
        {(["pricing", "details"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 border-b-2 ${tab === t ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "pricing" && (
        <>
          <div className="border rounded-lg p-4 bg-white mb-3">
            <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Base price</p>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-neutral-500 w-20">Currency</span>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="border rounded px-2 text-xs h-8">
                <option>KWD</option><option>USD</option><option>EUR</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 w-20">Price</span>
              <div className="flex">
                <span className="text-xs text-neutral-500 px-2 border border-r-0 rounded-l flex items-center bg-neutral-50 h-8">{currency}</span>
                <input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)}
                  placeholder="—" className="w-24 border rounded-r px-2 text-sm h-8" />
              </div>
            </div>
            {!price && <p className="text-[11px] text-neutral-400 mt-2">No price — visible only to coaches.</p>}
          </div>

          <DiscountSection
            discountType={discountType} setDiscountType={setDiscountType}
            discountValue={discountValue} setDiscountValue={setDiscountValue}
            discountEndsAt={discountEndsAt} setDiscountEndsAt={setDiscountEndsAt}
            currency={currency}
          />

          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-2">Store preview</p>
          <StorePreview
            name={template.name}
            meta={`${template.sessions.length} sessions`}
            currency={currency}
            price={price !== "" ? Number(price) : null}
            discountFlat={previewDiscountFlat}
            discountPercent={previewDiscountPct}
            discountEndsAt={discountEndsAt || null}
          />

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setShowGrantPicker(true)}
              className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs rounded hover:bg-neutral-100"
            >
              {grantedKey > 0 ? "✓ Granted — grant to another" : "Grant for free to..."}
            </button>
            <div className="flex items-center gap-3">
              {savedKey > 0 && (
                <span key={savedKey} className="text-xs text-green-600 animate-pulse">Saved</span>
              )}
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-neutral-900 text-white text-xs rounded hover:bg-neutral-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "details" && (
        <div className="border rounded-lg p-4 bg-white">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Details</p>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-neutral-500 w-20">Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="border rounded px-2 text-xs h-8 w-40">
              <option value="">—</option>
              <option>Strength</option><option>Conditioning</option>
              <option>Hypertrophy</option><option>Mobility</option><option>Fat Loss</option>
            </select>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs text-neutral-500 w-20 pt-1.5">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              className="flex-1 border rounded px-2 py-1.5 text-xs resize-none h-20" />
          </div>
          <div className="flex items-center justify-end mt-4">
            <div className="flex items-center gap-3">
              {savedKey > 0 && (
                <span key={savedKey} className="text-xs text-green-600 animate-pulse">Saved</span>
              )}
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-neutral-900 text-white text-xs rounded hover:bg-neutral-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bundle Editor ────────────────────────────────────────────────────────────

function BundleEditor({ bundle, templates, isAdmin, onSaved, onDeleted }: {
  bundle: Bundle; templates: Template[]; isAdmin: boolean;
  onSaved: (b: Bundle) => void; onDeleted: (id: string) => void;
}) {
  const [tab, setTab] = useState<"pricing" | "items">("pricing");
  const [currency, setCurrency] = useState(bundle.currency || "KWD");
  const [discountType, setDiscountType] = useState<DiscountType>(
    bundle.discountFlat != null ? "flat" : "pct"
  );
  const [discountValue, setDiscountValue] = useState(
    bundle.discountFlat != null ? String(bundle.discountFlat)
    : bundle.discountPercent != null ? String(bundle.discountPercent)
    : ""
  );
  const [discountEndsAt, setDiscountEndsAt] = useState(
    bundle.discountEndsAt ? bundle.discountEndsAt.slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fullPrice = bundleFullPrice(bundle.items);
  const discountFlat = discountType === "flat" && discountValue !== "" ? Number(discountValue) : null;
  const discountPercent = discountType === "pct" && discountValue !== "" ? Number(discountValue) : null;
  const finalPrice = effectivePrice(fullPrice, discountFlat, discountPercent, discountEndsAt || null);
  const cur = currency || "KWD";

  useEffect(() => {
    setCurrency(bundle.currency || "KWD");
    setDiscountType(bundle.discountFlat != null ? "flat" : "pct");
    setDiscountValue(
      bundle.discountFlat != null ? String(bundle.discountFlat)
      : bundle.discountPercent != null ? String(bundle.discountPercent)
      : ""
    );
    setDiscountEndsAt(bundle.discountEndsAt ? bundle.discountEndsAt.slice(0, 10) : "");
    setTab("pricing");
  }, [bundle.id]);

  async function handleSavePricing() {
    setSaving(true);
    const body: Record<string, unknown> = {
      currency,
      discountEndsAt: discountEndsAt || null,
      ...(discountType === "flat" && discountValue !== ""
        ? { discountFlat: Number(discountValue), discountPercent: null }
        : discountType === "pct" && discountValue !== ""
        ? { discountPercent: Number(discountValue), discountFlat: null }
        : { discountFlat: null, discountPercent: null }),
    };
    const res = await fetch(`/api/coach/bundles/${bundle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.bundle) { onSaved(data.bundle); setSavedKey(k => k + 1); }
    setSaving(false);
  }

  async function handleRemoveItem(templateId: string) {
    const remaining = bundle.items.filter(it => it.template.id !== templateId).map(it => it.template.id);
    const res = await fetch(`/api/coach/bundles/${bundle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateIds: remaining }),
    });
    const data = await res.json();
    if (data.bundle) onSaved(data.bundle);
  }

  async function handleDelete() {
    if (!confirm("Delete this bundle?")) return;
    setDeleting(true);
    await fetch(`/api/coach/bundles/${bundle.id}`, { method: "DELETE" });
    onDeleted(bundle.id);
  }

  return (
    <div>
      {showPicker && (
        <TemplatePicker
          allTemplates={templates}
          currentIds={bundle.items.map(it => it.template.id)}
          onClose={() => setShowPicker(false)}
          onConfirm={async (ids) => {
            const res = await fetch(`/api/coach/bundles/${bundle.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templateIds: ids }),
            });
            const data = await res.json();
            if (data.bundle) onSaved(data.bundle);
            setShowPicker(false);
          }}
        />
      )}

      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-medium">{bundle.name}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {bundle.items.length} templates
            {isAdmin && ` · by ${bundle.coach.name}`}
          </p>
        </div>
        <button onClick={handleDelete} disabled={deleting}
          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">
          Delete bundle
        </button>
      </div>

      <div className="flex border-b mb-4 text-xs">
        {(["pricing", "items"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 border-b-2 ${tab === t ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "pricing" && (
        <>
          <div className="border rounded-lg p-4 bg-white mb-3">
            <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Templates</p>
            {bundle.items.map(it => (
              <div key={it.template.id} className="flex items-center text-xs py-1.5 border-b last:border-b-0">
                <span className="flex-1 text-neutral-700">{it.template.name}</span>
                <span className="text-neutral-400">{it.template.currency || cur} {Number(it.template.price || 0).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-medium pt-2 mt-1 border-t">
              <span className="text-neutral-500">Full price</span>
              <span>{cur} {fullPrice.toFixed(2)}</span>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-white mb-3">
            <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Currency</p>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="border rounded px-2 text-xs h-8">
              <option>KWD</option><option>USD</option><option>EUR</option>
            </select>
          </div>

          <DiscountSection
            discountType={discountType} setDiscountType={setDiscountType}
            discountValue={discountValue} setDiscountValue={setDiscountValue}
            discountEndsAt={discountEndsAt} setDiscountEndsAt={setDiscountEndsAt}
            currency={cur}
          />

          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-2">Store preview</p>
          <StorePreview
            name={bundle.name}
            meta={bundle.items.map(it => it.template.name).join(" · ")}
            currency={cur}
            price={fullPrice}
            discountFlat={discountFlat}
            discountPercent={discountPercent}
            discountEndsAt={discountEndsAt || null}
            isBundle
            bundleCount={bundle.items.length}
          />

          <div className="flex items-center justify-end gap-3 mt-4">
            {savedKey > 0 && (
              <span key={savedKey} className="text-xs text-green-600 animate-pulse">Saved</span>
            )}
            <button onClick={handleSavePricing} disabled={saving}
              className="px-4 py-2 bg-neutral-900 text-white text-xs rounded hover:bg-neutral-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </>
      )}

      {tab === "items" && (
        <div className="border rounded-lg p-4 bg-white">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-3">Templates in bundle</p>
          {bundle.items.map(it => (
            <div key={it.template.id} className="flex items-center gap-2 py-2 border-b last:border-b-0 text-sm">
              <span className="flex-1">{it.template.name}</span>
              <span className="text-xs text-neutral-400">{it.template.currency} {Number(it.template.price || 0).toFixed(2)}</span>
              <button onClick={() => handleRemoveItem(it.template.id)}
                className="text-neutral-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
          <button onClick={() => setShowPicker(true)}
            className="mt-3 text-xs text-blue-600 hover:text-blue-800">
            + add template
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Template Picker Modal ────────────────────────────────────────────────────

function TemplatePicker({ allTemplates, currentIds, onClose, onConfirm, createMode = false, bundleName = "", onBundleNameChange }: {
  allTemplates: Template[]; currentIds: string[];
  onClose: () => void; onConfirm: (ids: string[], name?: string) => Promise<void>;
  createMode?: boolean; bundleName?: string; onBundleNameChange?: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(currentIds));
  const [confirming, setConfirming] = useState(false);

  const filtered = useMemo(() =>
    allTemplates.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
    [allTemplates, search]
  );

  const canConfirm = createMode
    ? bundleName.trim().length > 0 && selected.size >= 2
    : selected.size >= 2;

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm([...selected], bundleName);
    setConfirming(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-80 shadow-lg border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">{createMode ? "New bundle" : "Add templates"}</p>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-lg">×</button>
        </div>
        {createMode && (
          <div className="px-4 pt-3 pb-2 border-b">
            <label className="text-xs text-neutral-500 block mb-1">Bundle name</label>
            <input type="text" value={bundleName} onChange={e => onBundleNameChange?.(e.target.value)}
              placeholder="e.g. Beginner Pack"
              className="w-full border rounded px-2 py-1.5 text-sm" autoFocus />
          </div>
        )}
        <div className="px-4 pt-3 pb-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..." className="w-full border rounded px-2 py-1.5 text-xs" />
        </div>
        <div className="max-h-52 overflow-y-auto px-2 pb-2">
          {filtered.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-neutral-50 cursor-pointer">
              <input type="checkbox" checked={selected.has(t.id)}
                onChange={e => {
                  const next = new Set(selected);
                  e.target.checked ? next.add(t.id) : next.delete(t.id);
                  setSelected(next);
                }} className="accent-neutral-900" />
              <span className="flex-1 text-sm">{t.name}</span>
              <span className="text-xs text-neutral-400">{t.price ? `${t.currency} ${Number(t.price).toFixed(0)}` : "no price"}</span>
            </label>
          ))}
          {filtered.length === 0 && <p className="text-xs text-neutral-400 px-2 py-3">No templates match.</p>}
        </div>
        {createMode && selected.size > 0 && (
          <p className="text-xs text-neutral-500 px-4 py-1">{selected.size} selected{selected.size < 2 ? " (need at least 2)" : ""}</p>
        )}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded text-neutral-500">Cancel</button>
          <button onClick={handleConfirm} disabled={!canConfirm || confirming}
            className="px-3 py-1.5 text-xs bg-neutral-900 text-white rounded disabled:opacity-40">
            {confirming ? "..." : createMode ? "Create bundle" : "Add selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [sideTab, setSideTab] = useState<"templates" | "bundles">("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [bundleSearch, setBundleSearch] = useState("");
  const [showNewBundle, setShowNewBundle] = useState(false);
  const [newBundleName, setNewBundleName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    const [tr, br, cr] = await Promise.all([
      fetch("/api/coach/templates/pricing").then(r => r.json()),
      fetch("/api/coach/bundles").then(r => r.json()),
      fetch("/api/coach/clients").then(r => r.json()),
    ]);
    if (tr.templates) { setTemplates(tr.templates); setIsAdmin(tr.isAdmin ?? false); }
    if (br.bundles) setBundles(br.bundles);
    if (Array.isArray(cr)) setClients(cr);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredTemplates = useMemo(() =>
    templates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase())),
    [templates, templateSearch]
  );
  const filteredBundles = useMemo(() =>
    bundles.filter(b => b.name.toLowerCase().includes(bundleSearch.toLowerCase())),
    [bundles, bundleSearch]
  );

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;
  const selectedBundle = bundles.find(b => b.id === selectedBundleId) ?? null;

  async function handleCreateBundle(ids: string[], name?: string) {
    if (!name?.trim() || ids.length < 2) return;
    setCreating(true);
    const res = await fetch("/api/coach/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), templateIds: ids, currency: "KWD" }),
    });
    const data = await res.json();
    if (data.bundle) {
      setBundles(prev => [...prev, data.bundle]);
      setSelectedBundleId(data.bundle.id);
      setSideTab("bundles");
    }
    setShowNewBundle(false);
    setNewBundleName("");
    setCreating(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-sm text-neutral-400">Loading...</div>
  );

  return (
    <div className="flex min-h-screen">
      {showNewBundle && (
        <TemplatePicker
          allTemplates={templates}
          currentIds={[]}
          onClose={() => { setShowNewBundle(false); setNewBundleName(""); }}
          onConfirm={handleCreateBundle}
          createMode
          bundleName={newBundleName}
          onBundleNameChange={setNewBundleName}
        />
      )}

      {/* Sidebar */}
      <div className="w-60 border-r flex flex-col bg-white">
        <div className="flex border-b">
          {(["templates", "bundles"] as const).map(t => (
            <button key={t} onClick={() => setSideTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 ${sideTab === t ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-400"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-b">
          <input
            type="text"
            placeholder="Search..."
            value={sideTab === "templates" ? templateSearch : bundleSearch}
            onChange={e => sideTab === "templates" ? setTemplateSearch(e.target.value) : setBundleSearch(e.target.value)}
            className="w-full h-7 border rounded px-2 text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sideTab === "templates" && filteredTemplates.map(t => (
            <button key={t.id} onClick={() => { setSelectedTemplateId(t.id); setSelectedBundleId(null); }}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left text-xs ${
                selectedTemplateId === t.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"
              }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 border ${
                t.price ? "bg-green-500 border-green-500" : "bg-transparent border-neutral-300"
              }`} />
              <span className="truncate">{t.name}</span>
            </button>
          ))}

          {sideTab === "bundles" && filteredBundles.map(b => (
            <button key={b.id} onClick={() => { setSelectedBundleId(b.id); setSelectedTemplateId(null); }}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left text-xs ${
                selectedBundleId === b.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"
              }`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500 border-green-500 border" />
              <span className="truncate flex-1">{b.name}</span>
              <span className="text-[10px] bg-blue-50 text-blue-600 rounded px-1">{b.items.length}</span>
            </button>
          ))}

          {sideTab === "templates" && filteredTemplates.length === 0 && (
            <p className="text-xs text-neutral-400 px-2 py-3">No templates match.</p>
          )}
          {sideTab === "bundles" && filteredBundles.length === 0 && (
            <p className="text-xs text-neutral-400 px-2 py-3">No bundles yet.</p>
          )}
        </div>

        <div className="p-2 border-t">
          {sideTab === "bundles" && (
            <button onClick={() => setShowNewBundle(true)}
              className="w-full py-2 border border-dashed border-neutral-300 rounded text-xs text-neutral-400 hover:border-neutral-400 hover:text-neutral-600">
              + add bundle
            </button>
          )}
          {sideTab === "templates" && (
            <a href="/coach/clients"
              className="w-full py-2 border border-neutral-200 rounded text-xs text-neutral-400 hover:text-neutral-600 flex items-center justify-center">
              ← Back to clients
            </a>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-6 bg-neutral-50 overflow-y-auto">
        {selectedTemplate && (
          <TemplateEditor
            key={selectedTemplate.id}
            template={selectedTemplate}
            isAdmin={isAdmin}
            clients={clients}
            onSaved={(updated) => setTemplates(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))}
          />
        )}
        {selectedBundle && (
          <BundleEditor
            key={selectedBundle.id}
            bundle={selectedBundle}
            templates={templates}
            isAdmin={isAdmin}
            onSaved={(updated) => setBundles(prev => prev.map(b => b.id === updated.id ? updated : b))}
            onDeleted={(id) => { setBundles(prev => prev.filter(b => b.id !== id)); setSelectedBundleId(null); }}
          />
        )}
        {!selectedTemplate && !selectedBundle && (
          <div className="flex flex-col items-center justify-center h-full text-neutral-400">
            <p className="text-sm">Select a template or bundle from the sidebar</p>
          </div>
        )}
      </div>
    </div>
  );
}
