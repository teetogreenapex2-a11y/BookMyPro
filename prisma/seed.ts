// Now that availability belongs to a specific instructor (not just a
// business — see the multi-instructor / per-instructor-pricing work),
// there's no business to pre-seed here without also having a real
// instructor Membership to seed availability for, which this script has no
// way to create on its own.
//
// The clean path for local dev is simpler anyway: sign in, then use the
// onboarding flow at /onboarding — it creates the Business, your own
// "owner" Membership, AND seeds 4 weeks of your own availability, all in
// one step (see app/api/businesses/route.ts).
//
// This script is kept around as a placeholder (so `npm run prisma:seed`
// doesn't error out) rather than removed, in case a future need for
// pre-seeded demo data comes up.
async function main() {
  console.log("Nothing to seed automatically — sign in and visit /onboarding to create your business.");
  console.log("That flow creates the Business, your \"owner\" Membership, and your own availability in one step.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
