import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import GiftCardsClient from "./GiftCardsClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Gift Cards");
}

export default async function GiftCardsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  // Anyone can buy a gift card without an account (a relative in another
  // state, say). Only signed-in people get a membership or a card list.
  if (session) await ensureMembership((session.user as any).id, business.id, "player");
  const me = session ? await getMembership((session.user as any).id, business.id) : null;
  const isOwner = me?.role === "owner" && me?.status === "active";
  const { basePath, apiBase } = getBasePaths(params.slug);

  return <GiftCardsClient slug={params.slug} basePath={basePath} apiBase={apiBase} businessName={business.name} isOwner={isOwner} signedIn={!!session} />;
}
