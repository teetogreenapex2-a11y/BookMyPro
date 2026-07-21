// Swing Sketch images (both the flattened annotated PNG and the optional
// original source photo) use the same Vercel Blob storage already set up
// for swing videos — see lib/videoStorage.ts for the video equivalent.
import { put } from "@vercel/blob";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — generous for a canvas export or phone photo
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadSketchImage(file: File, businessId: string, kind: "annotated" | "source"): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "That doesn't look like an image file. Try .png, .jpg, or .webp." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "That image is too large — keep it under 15MB." };
  }

  const filename = `swing-sketches/${businessId}/${kind}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const blob = await put(filename, file, { access: "public" });
  return { url: blob.url };
}
