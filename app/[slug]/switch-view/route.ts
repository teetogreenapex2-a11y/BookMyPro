import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

// GET /{slug}/switch-view?to=player|instructor
// Lets an owner or instructor flip between their staff tabs and the tabs a
// player sees, with the same email and login. This only changes which tabs
// are shown (via the bmp_view cookie read by /api/{slug}/my-role) - it never
// changes anyone's real role, and staff pages still check the real role.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  const session = await getServerSession(authOptions);
  if (!business || !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const staff = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const toPlayer = req.nextUrl.searchParams.get("to") === "player";
  const res = NextResponse.redirect(getBusinessAbsoluteUrl(req, params.slug, staff && !toPlayer ? "/instructor" : "/book"));
  if (staff && toPlayer) {
    res.cookies.set("bmp_view", "player", { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8 });
  } else {
    res.cookies.set("bmp_view", "", { path: "/", maxAge: 0 });
  }
  return res;
}
