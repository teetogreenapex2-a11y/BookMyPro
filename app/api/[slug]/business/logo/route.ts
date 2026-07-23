import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { uploadBusinessLogo } from "@/lib/businessLogoStorage";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image file received" }, { status: 400 });
  }

  const uploaded = await uploadBusinessLogo(file, business.id);
  if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });

  const updated = await prisma.business.update({ where: { id: business.id }, data: { logoUrl: uploaded.url } });
  return NextResponse.json({ logoUrl: updated.logoUrl });
}
