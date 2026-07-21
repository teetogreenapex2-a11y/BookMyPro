// Swing analysis videos are stored with Vercel Blob — the simplest storage
// option for a Next.js app already deploying to Vercel: no separate cloud
// account to set up, just `npm install @vercel/blob` and a
// BLOB_READ_WRITE_TOKEN env var (Vercel generates this for you the moment
// you enable Blob storage in your project's Storage tab).
import { put } from "@vercel/blob";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB — generous for a phone-recorded swing clip, not unlimited
const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];

export async function uploadSwingVideo(file: File, businessId: string): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "That doesn't look like a video file. Try .mp4, .mov, or .webm." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { error: "That video is too large — keep it under 200MB (a minute or two of swing footage is plenty)." };
  }

  const filename = `swing-videos/${businessId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const blob = await put(filename, file, { access: "public" });
  return { url: blob.url };
}
