import { getServerSession } from "next-auth";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import { entriesFor } from "@/lib/changelog";
import { cookies } from "next/headers";
import WhatsNewClient from "./WhatsNewClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "What's new");
}

export default async function WhatsNewPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/whats-new`));
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();
  const me = await getMembership((session.user as any).id, business.id);
  // Match the view the person is in (an instructor in Player view sees player news).
  const isStaff = me?.role === "owner" || me?.role === "instructor";
  const viewAsPlayer = isStaff && cookies().get("bmp_view")?.value === "player";
  const role = viewAsPlayer ? "player" : me?.role || "player";
  const { basePath } = getBasePaths(params.slug);
  return <WhatsNewClient entries={entriesFor(role)} role={role} basePath={basePath} />;
}
