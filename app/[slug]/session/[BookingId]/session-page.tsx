import { getServerSession } from "next-auth";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getBasePaths } from "@/lib/tenant";
import SessionClient from "./SessionClient";

// Combined video call + Swing Sketch page for a single remote booking.
// Only the player on this specific booking, or the instructor delivering
// it, can access it - checked directly against the booking itself rather
// than general business membership, since this is scoped to one session,
// not the business as a whole.
export default async function SessionPage({ params }: { params: { slug: string; bookingId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/session/${params.bookingId}`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, businessId: business.id },
    include: { player: { select: { name: true, email: true } }, instructor: { select: { id: true, userId: true } } },
  });
  if (!booking || !booking.isRemote || !booking.videoCallUrl) notFound();

  const userId = (session.user as any).id;
  const isThePlayer = booking.playerId === userId;
  const isTheInstructor = booking.instructor?.userId === userId;
  if (!isThePlayer && !isTheInstructor) notFound();

  const { basePath, apiBase } = getBasePaths(params.slug);

  return (
    <SessionClient
      videoCallUrl={booking.videoCallUrl}
      playerId={booking.playerId}
      playerName={booking.player.name || booking.player.email}
      isInstructor={isTheInstructor}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
