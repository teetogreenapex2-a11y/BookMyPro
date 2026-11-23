import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/tenant";

// Platform-owner shortcuts. Anyone else gets a plain 404.
export default async function PlatformAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!(await isPlatformAdmin((session.user as any).id))) notFound();
  const links = [
    ["Pending businesses", "Approve or reject new pros", "/admin/pending-businesses"],
    ["New signups", "Everyone who just created an account", "/admin/signups"],
    ["Expiring trials", "Trials that are ending", "/admin/expiring-trials"],
    ["Billing", "Platform billing", "/admin/billing"],
    ["Features", "Turn features on or off", "/admin/features"],
  ];
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Platform admin</h1>
      {links.map(([t, d, h]) => (
        <Link key={h} href={h} style={{ display: "block", background: "#FFF", border: "1px solid #E3E6DE", borderRadius: 12, padding: "14px 16px", marginBottom: 8, textDecoration: "none", color: "inherit" }}>
          <strong>{t}</strong>
          <div style={{ fontSize: 13, color: "#5C6459" }}>{d}</div>
        </Link>
      ))}
    </div>
  );
}
