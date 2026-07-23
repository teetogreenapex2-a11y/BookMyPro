import { put } from "@vercel/blob";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadBusinessLogo(file: File, businessId: string): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "That doesn't look like an image file. Try .png, .jpg, or .webp." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "That image is too large - keep it under 5MB." };
  }

  const filename = `logos/${businessId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const blob = await put(filename, file, { access: "public" });
  return { url: blob.url };
}
