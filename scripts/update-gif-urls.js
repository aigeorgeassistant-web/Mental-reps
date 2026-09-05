// scripts/update-gif-urls.js
//
// Reads the real list of files in the R2 bucket, matches each one to an
// exercise by name (case-insensitive, ignoring the .gif extension), and
// updates that exercise's gifUrl to the real media.mentalreps.work link.
// Anything that doesn't match cleanly is reported, not guessed at.
//
// SETUP (one time):
//   npm install @aws-sdk/client-s3 dotenv
//
// USAGE:
//   node scripts/update-gif-urls.js

require("dotenv").config();
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PREFIX = "Exercise images/";
const PUBLIC_BASE = "https://media.mentalreps.work";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function listAllObjects() {
  let keys = [];
  let continuationToken = undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of result.Contents || []) {
      if (obj.Key && obj.Key.toLowerCase().endsWith(".gif")) {
        keys.push(obj.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

function normalize(name) {
  return name.trim().toLowerCase();
}

async function main() {
  const keys = await listAllObjects();
  console.log(`Found ${keys.length} .gif files in the bucket.`);

  const exercises = await prisma.exercise.findMany();
  const byNormalizedName = new Map(exercises.map((e) => [normalize(e.name), e]));

  const matchedExerciseIds = new Set();
  const unmatchedFiles = [];
  let updated = 0;

  for (const key of keys) {
    const filename = key.slice(PREFIX.length); // "dead bugs.gif"
    const withoutExt = filename.replace(/\.gif$/i, ""); // "dead bugs"
    const match = byNormalizedName.get(normalize(withoutExt));

    if (!match) {
      unmatchedFiles.push(filename);
      continue;
    }

    const url = `${PUBLIC_BASE}/${encodeURI(key)}`;
    await prisma.exercise.update({
      where: { id: match.id },
      data: { gifUrl: url },
    });
    matchedExerciseIds.add(match.id);
    updated++;
  }

  const exercisesWithNoFile = exercises.filter((e) => !matchedExerciseIds.has(e.id));

  console.log(`\nUpdated: ${updated}`);

  if (unmatchedFiles.length) {
    console.log(`\nFiles that didn't match any exercise name (${unmatchedFiles.length}):`);
    unmatchedFiles.forEach((f) => console.log(`  - ${f}`));
  }

  if (exercisesWithNoFile.length) {
    console.log(`\nExercises with no matching file found (${exercisesWithNoFile.length}):`);
    exercisesWithNoFile.forEach((e) => console.log(`  - ${e.name}`));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
