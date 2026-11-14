import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { confirmVenmoPayment, cancelVenmoPayment } from "@/lib/venmoCheckout";

// Owner sees every Venmo payment; an instructor sees the ones paid to them.
async function who(slug: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) } as const;
  const me = await getMembership((session.user as any).id, business.id);
  if (!me || (me.role !== "owner" && me.role !== "instructor")) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  return { business, me } as const;
}

// GET /api/{slug}/venmo -> { pending, recent }
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const w = await who(params.slug);
  if ("error" in w) return w.error;
  const mine = w.me.role === "owner" ? {} : { payeeMembershipId: w.me.id };
  const rows = await prisma.venmoPayment.findMany({
    where: { businessId: w.business.id, ...mine },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const out = rows.map((r) => ({
    id: r.id, kind: r.kind, description: r.description, amountCents: r.amountCents, status: r.status,
    customerName: r.customerName, customerEmail: r.customerEmail, ref: r.id.slice(-5).toUpperCase(),
    createdAt: r.createdAt.toISOString(),
  }));
  return NextResponse.json({ pending: out.filter((r) => r.status === "pending"), recent: out.filter((r) => r.status !== "pending").slice(0, 15) });
}

// POST /api/{slug}/venmo { id, action: "confirm" | "cancel" }
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const w = await who(params.slug);
  if ("error" in w) return w.error;
  const { id, action } = await req.json();
  const pay = await prisma.venmoPayment.findFirst({ where: { id: String(id || ""), businessId: w.business.id } });
  if (!pay) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (w.me.role !== "owner" && pay.payeeMembershipId !== w.me.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (action === "confirm") {
    try {
      const ok = await confirmVenmoPayment(pay.id);
      return NextResponse.json({ ok, already: !ok });
    } catch (e) {
      console.error("Venmo confirm failed:", e);
      return NextResponse.json({ error: "Couldn't finish that - try Confirm again." }, { status: 500 });
    }
  }
  if (action === "cancel") {
    const ok = await cancelVenmoPayment(pay.id);
    return NextResponse.json({ ok, already: !ok });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
