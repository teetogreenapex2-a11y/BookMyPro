// Safe, read-only - checks whether a specific person's account has ever
// actually registered a device for push notifications at all. Doesn't
// change anything. Run with:
//   npx tsx prisma/check-push-registration.ts someone@email.com
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: npx tsx prisma/check-push-registration.ts someone@email.com");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account found with email ${email}.`);
    return;
  }

  console.log(`Found account: ${user.name || "(no name)"} <${user.email}>`);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { business: { select: { name: true, slug: true } } },
  });

  if (memberships.length === 0) {
    console.log("This account has no memberships at any business at all.");
    return;
  }

  for (const m of memberships) {
    console.log(`\n-- ${m.business.name} (${m.role}, status: ${m.status}) --`);
    const tokens = await prisma.fcmToken.findMany({ where: { membershipId: m.id } });
    const subs = await prisma.pushSubscription.findMany({ where: { membershipId: m.id } });
    console.log(`Native app push tokens: ${tokens.length}`);
    console.log(`Web browser push subscriptions: ${subs.length}`);
    if (tokens.length === 0 && subs.length === 0) {
      console.log("-> No device has ever registered for push here. This is almost certainly why notifications aren't arriving.");
    }
  }
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
