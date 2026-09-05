// lib/taxonomy.ts
// Single source of truth for muscle group and equipment taxonomies.
// UI components import from here — never hardcode these lists elsewhere.

export type TaxonomyGroup<T extends string> = {
  label: string;
  items: T[];
};

// ─── Muscle Groups ────────────────────────────────────────────────────────────

export const MUSCLE_TAXONOMY: TaxonomyGroup<string>[] = [
  {
    label: "Upper Body",
    items: ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms", "Core"],
  },
  {
    label: "Lower Body",
    items: ["Quads", "Hamstrings", "Glutes", "Calves", "Tibialis"],
  },
  { label: "Full Body", items: ["Full Body"] },
  { label: "Cardio", items: ["Cardio"] },
];

// Flat list — all valid muscle group strings
export const ALL_MUSCLE_GROUPS: string[] = MUSCLE_TAXONOMY.flatMap((g) => g.items);

// ─── Equipment ────────────────────────────────────────────────────────────────

export const EQUIPMENT_TAXONOMY: TaxonomyGroup<string>[] = [
  {
    label: "Free Weights",
    items: ["Barbell", "Dumbbell", "Kettlebell", "Sandbag", "Med Ball", "Wall Ball"],
  },
  {
    label: "Machines",
    items: ["Machine", "Cable"],
  },
  {
    label: "Accessories",
    items: ["Bench", "Bands", "Box", "TRX", "Stepper"],
  },
  { label: "Bodyweight", items: ["Bodyweight"] },
  { label: "Other", items: ["Other"] },
];

// Flat list — all valid equipment strings
export const ALL_EQUIPMENT: string[] = EQUIPMENT_TAXONOMY.flatMap((g) => g.items);
