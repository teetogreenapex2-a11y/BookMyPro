import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { uploadSketchImage } from "@/lib/sketchStorage";

// POST /api/{slug}/swing-sketches/upload-source  (multipart, field "source")
// Just uploads a photo and returns its URL - a separate step from the main
// swing-sketches route, which saves the whole annotated sketch at once.
// Needed for the live session page, where the photo has to exist as a real
// URL before SwingCanvas can be started on it, ahead of the actual save.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("source");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image file received" }, { status: 400 });
  }

  const uploaded = await uploadSketchImage(file, business.id, "source");
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  return NextResponse.json({ url: uploaded.url });
}
