// scripts/import-exercises.js
//
// Imports/updates exercises from an xlsx sheet into Postgres via Prisma.
// Re-runnable: upserts by exercise name, so re-running after editing the
// sheet updates existing rows instead of duplicating.
//
// SETUP (one time):
//   npm install xlsx
//
// USAGE:
//   node scripts/import-exercises.js path/to/Exercise_images.xlsx
//
// Expects columns: Exercise | Image | Cues | Muscle Group | Equipment
// (same as George's Google Sheet export)

const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function splitList(value, delimiter) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/import-exercises.js <path-to-xlsx>");
    process.exit(1);
  }

  const workbook = XLSX.readFile(path.resolve(filePath));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row["Exercise"]?.toString().trim();
    if (!name) {
      skipped++;
      continue;
    }

    const gifUrl = row["Image"]?.toString().trim() || null; // Drive link for now — swap to R2 URL once GIFs are migrated
    const cues = row["Cues"] ? row["Cues"].toString().trim() : null;
    const muscleGroups = splitList(row["Muscle Group"], "/");
    const equipment = splitList(row["Equipment"], ",");

    const existing = await prisma.exercise.findFirst({ where: { name } });

    if (existing) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: { gifUrl, cues, muscleGroups, equipment },
      });
      updated++;
    } else {
      await prisma.exercise.create({
        data: { name, gifUrl, cues, muscleGroups, equipment },
      });
      created++;
    }
  }

  console.log(`Done. Created: ${created}, Updated: ${updated}, Skipped (no name): ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
