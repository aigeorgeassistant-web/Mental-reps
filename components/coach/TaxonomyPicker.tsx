"use client";
// components/coach/TaxonomyPicker.tsx
// Reusable tree-style picker for muscle groups and equipment.
// Shows parent group labels with children as toggle chips.
// Selected items are highlighted; parent label goes green if any child selected.

import type { TaxonomyGroup } from "@/lib/taxonomy";

export function TaxonomyPicker({
  taxonomy,
  selected,
  onChange,
}: {
  taxonomy: TaxonomyGroup<string>[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  function toggle(item: string) {
    onChange(
      selected.includes(item)
        ? selected.filter((x) => x !== item)
        : [...selected, item]
    );
  }

  function toggleGroup(items: string[]) {
    const allSelected = items.every((i) => selected.includes(i));
    if (allSelected) {
      onChange(selected.filter((x) => !items.includes(x)));
    } else {
      const toAdd = items.filter((i) => !selected.includes(i));
      onChange([...selected, ...toAdd]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {taxonomy.map((group) => {
        const anySelected = group.items.some((i) => selected.includes(i));
        const isSingle = group.items.length === 1 && group.items[0] === group.label;
        return (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.items)}
              className={`text-[10px] font-medium mb-1 px-1 rounded transition-colors ${
                anySelected ? "text-green-600" : "text-neutral-400 hover:text-neutral-600"
              }`}
            >
              {group.label} {anySelected && !isSingle ? `(${group.items.filter(i => selected.includes(i)).length})` : ""}
            </button>
            {!isSingle && (
              <div className="flex flex-wrap gap-1 pl-1">
                {group.items.map((item) => (
                  <button
                    key={item}
                    onClick={() => toggle(item)}
                    className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
                      selected.includes(item)
                        ? "bg-green-500 text-white border-green-500"
                        : "text-neutral-500 border-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Filter variant — used in left panel exercises tab ─────────────────────────
// Same tree but rendered more compact, with a clear-all button.

export function TaxonomyFilter({
  taxonomy,
  selected,
  onChange,
}: {
  taxonomy: TaxonomyGroup<string>[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <TaxonomyPicker taxonomy={taxonomy} selected={selected} onChange={onChange} />
      {selected.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="self-start rounded-full px-2 py-0.5 text-[10px] border border-red-200 text-red-400 hover:bg-red-50"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
