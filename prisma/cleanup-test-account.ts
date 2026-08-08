// One-time cleanup script - safely removes a single test account by its
// exact email address, and everything tied to it (memberships, linked
// sign-in methods, sessions, saved notification subscriptions). Only
// ever touches this one specific email, never anything else. Run with:
//   npx tsx prisma/cleanup-test-account.ts
import { prisma } from "../lib/prisma";

const EMAIL_TO_DELETE = "teetogreenapex1@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL_TO_DELETE } });
  if (!user) {
    console.log(`No account found with email ${EMAIL_TO_DELETE} - nothing to do.`);
    return;
  }

  console.log(`Found account: ${user.name || "(no name)"} <${user.email}> - id ${user.id}`);

  const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
  const membershipIds = memberships.map((m) => m.id);
  console.log(`Found ${memberships.length} membership(s) tied to this account.`);

  if (membershipIds.length > 0) {
    const subs = await prisma.pushSubscription.deleteMany({ where: { membershipId: { in: membershipIds } } });
    const tokens = await prisma.fcmToken.deleteMany({ where: { membershipId: { in: membershipIds } } });
    console.log(`Removed ${subs.count} push subscription(s), ${tokens.count} device token(s).`);

    // This account got approved at some point during testing, which
    // means real calendar slots, bookings, and packages may already be
    // tied to its membership - all of these have to go first, or the
    // database correctly refuses to delete the membership itself while
    // anything still points back to it.
    const bookings = await prisma.booking.deleteMany({ where: { instructorMembershipId: { in: membershipIds } } });
    const availability = await prisma.availability.deleteMany({ where: { instructorMembershipId: { in: membershipIds } } });
    const packages = await prisma.package.deleteMany({ where: { instructorMembershipId: { in: membershipIds } } });
    const pendingPayments = await prisma.pendingSquarePayment.deleteMany({ where: { instructorMembershipId: { in: membershipIds } } });
    console.log(`Removed ${bookings.count} booking(s), ${availability.count} calendar slot(s), ${packages.count} package(s), ${pendingPayments.count} pending payment(s).`);
  }

  const deletedMemberships = await prisma.membership.deleteMany({ where: { userId: user.id } });
  console.log(`Removed ${deletedMemberships.count} membership(s).`);

  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  console.log("Removed any sessions and linked sign-in methods.");

  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Deleted the account for ${EMAIL_TO_DELETE}. Done.`);
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
