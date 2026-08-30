import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// PATCH /api/{slug}/playing-lesson-requests/{id}  { status: "pending" | "handled" }
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const request = await prisma.playingLessonRequest.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === request.instructorMembershipId;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only manage your own requests" }, { status: 403 });
  }

  const { status } = await req.json();
  if (status !== "pending" && status !== "handled") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.playingLessonRequest.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(updated);
}
