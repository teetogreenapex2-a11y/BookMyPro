import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import SwingSketchEditorClient from "./SwingSketchEditorClient";

export default async function SwingSketchEditorPage({ params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  return (
    <Suspense fallback={null}>
      <SwingSketchEditorClient slug={params.slug} basePath={basePath} apiBase={apiBase} id={params.id} />
    </Suspense>
  );
}
