// scripts/rename-gif-files.js
//
// R2 (like all S3-compatible storage) has no real "rename" — this copies
// each file to its correct name, then deletes the old one. After running
// this, rerun update-gif-urls.js to pick up the newly-renamed files and
// update the database.
//
// USAGE:
//   node scripts/rename-gif-files.js

require("dotenv").config();
const { S3Client, CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const PREFIX = "Exercise images/";
const BUCKET = process.env.R2_BUCKET_NAME;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// [old filename, new filename] — both relative to PREFIX, confirmed with George
const RENAMES = [
  ["GHD machine back extensions.gif", "GHD back extensions.gif"],
  ["banded pull up.gif", "Banded pullup.gif"],
  ["cable side raise behind the back.gif", "cable side raises behind the back.gif"],
  ["chest machine techno gym.gif", "Chest machine.gif"],
  ["chest supported DB rows.gif", "Chest supported rows.gif"],
  ["chest supported row machine 85.gif", "chest supported rows machine 85.gif"],
  ["chest supported rows machine  73.gif", "chest supported rows machine 73.gif"],
  ["hack squat 5.gif", "Hack squat machine.gif"],
  ["high incline narrow shoulder press.gif", "high Incline bench narrow shoulder press.gif"],
  ["incilne narrow DB bench press.gif", "Incline Narrow DB press.gif"],
  ["incline DB Y raises.gif", "Incline bench Y raises.gif"],
  ["incline biceps curls.gif", "biceps curls incline.gif"],
  ["incline push ups.gif", "Push ups incline.gif"],
  ["kneeling banded kickback.gif", "Banded kick back kneeling.gif"],
  ["lat pulldown.gif", "Cable lat pulldown.gif"],
  ["one arm rows gif.gif", "One arm rows.gif"],
  ["paloff press.gif", "Palloff press.gif"],
  ["pendulum squat.gif", "Pendulum Squat machine.gif"],
  ["banded clam shells.gif", "Clam shells.gif"],
  ["bird dogs octree less frames 69.gif", "bird dogs.gif"],
  ["incline back extensions.gif", "Back extensions 45 degree.gif"],
];

async function main() {
  for (const [oldName, newName] of RENAMES) {
    const oldKey = PREFIX + oldName;
    const newKey = PREFIX + newName;
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          CopySource: `${BUCKET}/${encodeURIComponent(oldKey)}`,
          Key: newKey,
        })
      );
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }));
      console.log(`Renamed: "${oldName}" -> "${newName}"`);
    } catch (err) {
      console.error(`FAILED: "${oldName}" -> "${newName}":`, err.message);
    }
  }
  console.log("\nDone. Now rerun: node scripts/update-gif-urls.js");
}

main();
