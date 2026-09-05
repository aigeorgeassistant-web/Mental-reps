// app/api/exercises/upload-url/route.ts
// Returns a pre-signed R2 PUT URL so the browser can upload a GIF
// directly to the bucket without routing the file through Vercel.

import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "filename and contentType required" }, { status: 400 });
    }

    // Sanitise filename — strip path separators, keep extension
    const safe = filename.replace(/[^a-zA-Z0-9._\- ]/g, "_");
    const key = `Exercise images/${safe}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 300 }); // 5 min

    const publicUrl = `https://media.mentalreps.work/${encodeURIComponent(key).replace(/%2F/g, "/")}`;

    return NextResponse.json({ signedUrl, publicUrl, key });
  } catch (err) {
    console.error("upload-url error", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
