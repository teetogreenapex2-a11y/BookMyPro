import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import RaffleClient from "./RaffleClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Raffle");
}

// Public: customers don't need to sign in to claim a space.
export default async function RafflePage({ params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) notFound();
  const session = await getServerSession(authOptions);
  const me = session ? await getMembership((session.user as any).id, business.id) : null;
  const isOwner = !!me && me.role === "owner" && me.status === "active";
  const { apiBase } = getBasePaths(params.slug);
  return <RaffleClient apiBase={apiBase} businessName={business.name} isOwner={isOwner} />;
}
