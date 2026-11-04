import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createReviewSubmission, findSendableInstructor, reviewPriceFor } from "@/lib/personalSend";

// POST /api/personal/send  { videoId, instructorMembershipId }
// Free review: the video goes straight to the instructor ({ ok: true }).
// Paid review: returns a Stripe Checkout { url } on the pro's own account;
// the video is only delivered once the Stripe webhook confirms payment.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const videoId = String(body.videoId || "");
  const instructorMembershipId = String(body.instructorMembershipId || "");
  if (!videoId || !instructorMembershipId) return NextResponse.json({ error: "Choose a video and an instructor." }, { status: 400 });

  const video = await prisma.personalVideo.findFirst({ where: { id: videoId, userId } });
  if (!video) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  const instructor = await findSendableInstructor(instructorMembershipId);
  if (!instructor) return NextResponse.json({ error: "That instructor isn't available." }, { status: 400 });

  const dup = await prisma.videoSubmission.findFirst({
    where: { playerId: userId, instructorMembershipId, videoUrl: video.videoUrl },
  });
  if (dup) return NextResponse.json({ error: "You already sent this video to that instructor." }, { status: 409 });

  const priceCents = await reviewPriceFor(userId, instructor);
  if (priceCents <= 0) {
    const done = await createReviewSubmission(userId, videoId, instructorMembershipId);
    if (!done) return NextResponse.json({ error: "Couldn't send that." }, { status: 400 });
    return NextResponse.json({ ok: true, businessName: instructor.business.name });
  }

  const business = instructor.business;
  if (business.paymentProvider !== "stripe" || !business.stripeAccountId) {
    return NextResponse.json({ error: "This pro can't take card payments yet." }, { status: 400 });
  }
  const acct = await getAccountStatus(business.stripeAccountId);
  if (!acct.chargesEnabled) return NextResponse.json({ error: "This pro hasn't finished setting up payments yet." }, { status: 400 });

  const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: session.user?.email || undefined,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Swing video review - ${instructor.user.name || business.name}` },
          unit_amount: priceCents,
        },
        quantity: 1,
      }],
      metadata: { kind: "video_review", businessId: business.id, userId, videoId, instructorMembershipId },
      success_url: `${origin}/personal?sent=1`,
      cancel_url: `${origin}/personal`,
    },
    { stripeAccount: business.stripeAccountId }
  );
  return NextResponse.json({ url: checkout.url });
}
