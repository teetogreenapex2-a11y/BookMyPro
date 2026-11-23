import { prisma } from "@/lib/prisma";
import { sendPushToMembership } from "@/lib/pushNotifications";

// Push to the platform owner (whoever owns the tee-to-green-golf business).
// Never throws - an alert failing must never break a signup.
export async function alertPlatformAdmin(payload: { title: string; body: string; url?: string }) {
  try {
    const admin = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" }, select: { id: true } });
    if (!admin) return;
    const owner = await prisma.membership.findFirst({ where: { businessId: admin.id, role: "owner", status: "active" }, select: { id: true } });
    if (!owner) return;
    const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
    await sendPushToMembership(owner.id, { ...payload, url: payload.url ? origin + payload.url : undefined });
  } catch (e) {
    console.error("Admin alert failed:", e);
  }
}

export function alertNewSignup(user: { name?: string | null; email?: string | null }, via: string) {
  const who = user.name || user.email || "Someone";
  return alertPlatformAdmin({ title: "New BookMyPro signup", body: `${who}${user.name && user.email ? ` (${user.email})` : ""} signed up with ${via}`, url: "/admin/signups" });
}
