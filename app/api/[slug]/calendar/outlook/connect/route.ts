import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOutlookAuthUrl } from "@/lib/outlook";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  // The callback URL is fixed (registered in the Azure portal) and can't
  // vary per business, so the business id travels through as OAuth `state`
  // — with an optional ":onboarding" suffix when this was kicked off from
  // the setup wizard, so the callback knows to send them back there instead
  // of Settings.
  const from = new URL(req.url).searchParams.get("from");
  const state = from === "onboarding" ? `${business.id}:onboarding` : business.id;
  return NextResponse.redirect(getOutlookAuthUrl(state));
}
