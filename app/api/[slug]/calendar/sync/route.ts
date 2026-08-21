import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncInstructorCalendar } from "@/lib/calendarSync";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/calendar/sync — manual "Sync now" button, owner/instructor
// only. Syncs the signed-in instructor's OWN connected calendar - matches
// the per-instructor Connected/Disconnect status already shown in
// Settings, rather than syncing every instructor at the business at once.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const result = await syncInstructorCalendar(business, membership, "manual");
  return NextResponse.json(result);
}
