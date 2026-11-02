import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

export const maxDuration = 60;

// POST /api/{slug}/players/bulk-import  { rows: [{ name, email, phone }] }
// Owner/instructor only. Adds each person as a customer (player) here.
// Anyone who is already a customer here is skipped, so it is safe to rerun.
// Phones are optional. An email that already has an account elsewhere just
// gets a membership here, same as the single "Add customer" route.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const input: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (input.length === 0) return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  if (input.length > 2000) return NextResponse.json({ error: "Too many rows (max 2000 at a time)" }, { status: 400 });

  const skipped: { row: number; name: string; reason: string }[] = [];
  const clean: { row: number; name: string; email: string; phone: string | null }[] = [];
  const seen = new Set<string>();
  input.forEach((r, i) => {
    const name = String(r?.name || "").trim();
    const email = String(r?.email || "").trim().toLowerCase();
    const phone = String(r?.phone || "").trim() || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped.push({ row: i + 2, name: name || email, reason: "Not a valid email" });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ row: i + 2, name: name || email, reason: "Duplicate email in file" });
      return;
    }
    seen.add(email);
    clean.push({ row: i + 2, name: name || email.split("@")[0], email, phone });
  });

  const emails = clean.map((c) => c.email);
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const existingEmails = new Set(existingUsers.map((u) => u.email));
  const toCreate = clean.filter((c) => !existingEmails.has(c.email));

  if (toCreate.length > 0) {
    await prisma.user.createMany({
      data: toCreate.map((c) => ({ name: c.name, email: c.email, phone: c.phone })),
      skipDuplicates: true,
    });
  }

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map<string, string>(users.map((u: any) => [u.email as string, u.id as string]));

  const members = await prisma.membership.findMany({
    where: { businessId: business.id, userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const alreadyHere = new Set(members.map((m) => m.userId));

  const toAdd: string[] = [];
  for (const c of clean) {
    const id = idByEmail.get(c.email);
    if (!id) {
      skipped.push({ row: c.row, name: c.name, reason: "Could not create" });
    } else if (alreadyHere.has(id)) {
      skipped.push({ row: c.row, name: c.name, reason: "Already a customer here" });
    } else {
      toAdd.push(id);
    }
  }

  if (toAdd.length > 0) {
    await prisma.membership.createMany({
      data: toAdd.map((userId) => ({ userId, businessId: business.id, role: "player" })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    totalRows: input.length,
    newPeople: toCreate.length,
    existingPeopleAdded: toAdd.length - toCreate.length,
    skipped,
  });
}
