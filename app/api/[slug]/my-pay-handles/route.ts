import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET / PATCH /api/{slug}/my-pay-handles  { venmoHandle?, cashAppHandle?, zelleContact? }
// Each instructor sets where their own customers can pay them outside the app.
async function who(slug: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) };
  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return { error: NextResponse.json({ error: "Instructor access required" }, { status: 403 }) };
  return { membership };
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const r = await who(params.slug);
  if (r.error) return r.error;
  const m = r.membership!;
  return NextResponse.json({ venmoHandle: m.venmoHandle || "", cashAppHandle: m.cashAppHandle || "", zelleContact: m.zelleContact || "" });
}

const clean = (v: unknown, strip: RegExp) => String(v ?? "").trim().replace(strip, "").slice(0, 80) || null;

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const r = await who(params.slug);
  if (r.error) return r.error;
  const body = await req.json();
  const updated = await prisma.membership.update({
    where: { id: r.membership!.id },
    data: {
      venmoHandle: clean(body.venmoHandle, /^@+/),
      cashAppHandle: clean(body.cashAppHandle, /^\$+/),
      zelleContact: clean(body.zelleContact, /\s+/g),
    },
  });
  return NextResponse.json({ venmoHandle: updated.venmoHandle || "", cashAppHandle: updated.cashAppHandle || "", zelleContact: updated.zelleContact || "" });
}
