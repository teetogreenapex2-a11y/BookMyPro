import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import { RAFFLE_PRESETS } from "@/lib/raffle";
import RaffleClient from "../RaffleClient";

export async function generateMetadata({ params }: { params: { slug: string; key: string } }) {
  return businessPageMetadata(params.slug, RAFFLE_PRESETS[params.key]?.title || "Raffle");
}

// A second raffle on its own link, e.g. /{slug}/raffle/200 (the 200/20 raffle).
// Public: customers don't need to sign in to claim a space.
export default async function NamedRafflePage({ params }: { params: { slug: string; key: string } }) {
  if (!RAFFLE_PRESETS[params.key]) notFound();
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) notFound();
  const session = await getServerSession(authOptions);
  const me = session ? await getMembership((session.user as any).id, business.id) : null;
  const isOwner = !!me && me.role === "owner" && me.status === "active";
  const { apiBase } = getBasePaths(params.slug);
  return <RaffleClient apiBase={apiBase} businessName={business.name} isOwner={isOwner} boardKey={params.key} />;
}
