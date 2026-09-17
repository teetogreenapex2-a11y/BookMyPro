import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import ReviewFormClient from "./ReviewFormClient";

export default async function ReviewPage({ params }: { params: { slug: string; bookingId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/${params.slug}/review/${params.bookingId}`)}`);

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const userId = (session.user as any).id;
  await ensureMembership(userId, business.id, "player");

  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, businessId: business.id, playerId: userId },
    include: { instructor: { include: { user: { select: { name: true } } } }, review: true },
  });

  const { basePath, apiBase } = getBasePaths(params.slug);

  // Any of these means there's nothing to review here - rather than a raw
  // 404, say plainly what's going on, since a real, valid link (from a
  // push notification or email) landing on a dead end otherwise reads
  // like the app is broken rather than "you're not eligible."
  let notice: string | null = null;
  if (!booking) notice = "That lesson couldn't be found.";
  else if (booking.status === "cancelled") notice = "That lesson was cancelled.";
  else if (booking.startTime > new Date()) notice = "That lesson hasn't happened yet.";
  else if (!booking.instructorMembershipId) notice = "There's no instructor on file for that lesson to review.";
  else if (booking.review) notice = "You've already reviewed this lesson - thank you!";

  if (notice) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--fairway, #1B3A2F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "32px 28px", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#1B3A2F", margin: 0 }}>{notice}</p>
          <a href={basePath} style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#B8862B", fontWeight: 700, textDecoration: "none" }}>
            Back to BookMyPro
          </a>
        </div>
      </div>
    );
  }

  return (
    <ReviewFormClient
      slug={params.slug}
      apiBase={apiBase}
      basePath={basePath}
      bookingId={params.bookingId}
      instructorName={booking!.instructor?.user.name || "your instructor"}
      businessName={business.name}
    />
  );
}
