// Sends one real, direct test notification to a specific person's
// device, and prints out exactly what happens - success or the real,
// specific error, rather than that error only ever landing in Vercel's
// own server logs where it's harder to find. Run with:
//   npx tsx prisma/test-push-notification.ts someone@email.com
import { prisma } from "../lib/prisma";
import { sendPushToMembership } from "../lib/pushNotifications";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("Usage: npx tsx prisma/test-push-notification.ts someone@email.com");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account found with email ${email}.`);
    return;
  }

  const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
  if (memberships.length === 0) {
    console.log("This account has no memberships anywhere.");
    return;
  }

  for (const m of memberships) {
    const tokens = await prisma.fcmToken.findMany({ where: { membershipId: m.id } });
    const subs = await prisma.pushSubscription.findMany({ where: { membershipId: m.id } });
    console.log(`\n-- Membership ${m.id} (${m.role}) --`);
    console.log(`Native tokens on file: ${tokens.length}`);
    console.log(`Web subscriptions on file: ${subs.length}`);
    if (tokens.length === 0 && subs.length === 0) {
      console.log("Nothing to send to - skipping, since there's genuinely no device registered here at all.");
      continue;
    }
    console.log("Sending a real test notification...");
    try {
      await sendPushToMembership(m.id, {
        title: "Test notification",
        body: "If you see this, push notifications are genuinely working.",
      });
      console.log("Send completed without throwing - check the device now for whether it actually arrived.");
    } catch (err) {
      console.error("Send genuinely threw an error:", err);
    }
  }
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
