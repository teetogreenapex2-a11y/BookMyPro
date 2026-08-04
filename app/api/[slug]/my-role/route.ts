import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/my-role
// A small, dedicated endpoint whose only job is answering "what role does
// the signed-in person have at this business" - built specifically for
// the native Android app's own tab bar, which has no other way to know
// this, since that information only ever exists in the website's own
// session and database.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ role: null });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ role: null });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  return NextResponse.json({ role: membership?.role || null });
}
