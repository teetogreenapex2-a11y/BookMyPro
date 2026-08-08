// Safely removes one specific business by its exact slug, and everything
// tied to it - only ever touches this one business, confirmed as the
// real, orphaned leftover from testing the old flow before tonight's
// request-and-approve system existed. Run with:
//   npx tsx prisma/cleanup-orphaned-business.ts
import { prisma } from "../lib/prisma";

const SLUG_TO_DELETE = "joes-garage-and-golf-lessons";

async function main() {
  const business = await prisma.business.findUnique({ where: { slug: SLUG_TO_DELETE } });
  if (!business) {
    console.log(`No business found with slug ${SLUG_TO_DELETE} - nothing to do.`);
    return;
  }

  console.log(`Found business: "${business.name}" (${business.slug}) - id ${business.id}`);

  const videos = await prisma.videoSubmission.deleteMany({ where: { businessId: business.id } });
  const sketches = await prisma.swingSketch.deleteMany({ where: { businessId: business.id } });
  const orders = await prisma.order.deleteMany({ where: { businessId: business.id } });
  const products = await prisma.product.deleteMany({ where: { businessId: business.id } });
  const giftCards = await prisma.giftCard.deleteMany({ where: { businessId: business.id } });
  const syncLogs = await prisma.syncLog.deleteMany({ where: { businessId: business.id } });
  console.log(`Removed ${videos.count} video(s), ${sketches.count} swing sketch(es), ${orders.count} order(s), ${products.count} product(s), ${giftCards.count} gift card(s), ${syncLogs.count} sync log(s).`);

  const bookings = await prisma.booking.deleteMany({ where: { businessId: business.id } });
  const availability = await prisma.availability.deleteMany({ where: { businessId: business.id } });
  const packages = await prisma.package.deleteMany({ where: { businessId: business.id } });
  const pendingPayments = await prisma.pendingSquarePayment.deleteMany({ where: { businessId: business.id } });
  console.log(`Removed ${bookings.count} booking(s), ${availability.count} calendar slot(s), ${packages.count} package(s), ${pendingPayments.count} pending payment(s).`);

  const memberships = await prisma.membership.deleteMany({ where: { businessId: business.id } });
  console.log(`Removed ${memberships.count} membership(s).`);

  await prisma.business.delete({ where: { id: business.id } });
  console.log(`Deleted the business "${business.name}" (${SLUG_TO_DELETE}). Done.`);
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
