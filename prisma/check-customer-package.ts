// Safe, read-only - shows exactly what a specific customer's packages
// actually look like, including their real, raw remaining count and
// which instructor each is tied to. Doesn't change anything. Run with:
//   npx tsx prisma/check-customer-package.ts someone@email.com
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: npx tsx prisma/check-customer-package.ts someone@email.com");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account found with email ${email}.`);
    return;
  }

  console.log(`Found account: ${user.name || "(no name)"} <${user.email}>`);

  const packages = await prisma.package.findMany({
    where: { userId: user.id },
    include: { business: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (packages.length === 0) {
    console.log("This account has no packages at all.");
    return;
  }

  const now = new Date();
  for (const pkg of packages) {
    console.log(`\n-- ${pkg.type} at ${pkg.business.name} (${pkg.business.slug}) --`);
    console.log(`Package id: ${pkg.id}`);
    console.log(`Instructor membership id: ${pkg.instructorMembershipId || "(none set)"}`);
    console.log(`Raw lessonsRemaining (real, stored): ${pkg.lessonsRemaining} of ${pkg.lessonsTotal}`);
    console.log(`Payment status: ${pkg.paymentStatus}`);

    const upcoming = await prisma.booking.count({
      where: { packageId: pkg.id, serviceType: "lesson", status: "confirmed", startTime: { gt: now } },
    });
    console.log(`Upcoming (already booked, not yet happened) lessons against this package: ${upcoming}`);
    console.log(`What the app would display: ${Math.min(pkg.lessonsRemaining + upcoming, pkg.lessonsTotal)} of ${pkg.lessonsTotal}`);

    if (pkg.lessonsRemaining <= 0) {
      console.log("-> Real, raw credits are genuinely at 0 - this is why booking another lesson isn't possible right now, even if the displayed number shows more.");
    }
  }
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
