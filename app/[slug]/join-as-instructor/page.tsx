import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import JoinAsInstructorClient from "./JoinAsInstructorClient";

export default async function JoinAsInstructorPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/join-as-instructor`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const userId = (session.user as any).id;
  const existing = await getMembership(userId, business.id);

  // Already an active owner/instructor here - nothing to request, just
  // send them straight to their real dashboard.
  if (existing && existing.status === "active" && (existing.role === "owner" || existing.role === "instructor")) {
    const { basePath } = getBasePaths(params.slug);
    redirect(`${basePath}/instructor`);
  }

  const { apiBase } = getBasePaths(params.slug);
  const alreadyPending = !!(existing && existing.status === "pending");

  return (
    <JoinAsInstructorClient
      slug={params.slug}
      businessName={business.name}
      apiBase={apiBase}
      defaultName={session.user?.name || ""}
      defaultEmail={session.user?.email || ""}
      alreadyPending={alreadyPending}
    />
  );
}
