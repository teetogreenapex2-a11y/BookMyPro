// Safe, read-only. Run with:
//   npx tsx prisma/check-business-memberships.ts tee-to-green-golf
import { prisma } from "../lib/prisma";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.log("Usage: npx tsx prisma/check-business-memberships.ts <slug>");
    return;
  }

  const business = await prisma.business.findUnique({ where: { slug } });
  if (!business) {
    console.log(`No business found with slug ${slug}.`);
    return;
  }

  const memberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: { in: ["owner", "instructor"] } },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Instructors/owner at ${business.name}:\n`);
  for (const m of memberships) {
    console.log(`- ${m.user.name || "(no name)"} <${m.user.email}> — role: ${m.role}, status: ${m.status}, id: ${m.id}, created: ${m.createdAt.toISOString()}`);
  }
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
