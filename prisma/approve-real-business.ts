// Marks Tee to Green Golf as approved immediately after adding the new
// "approved" field - without this, the real, already-existing business
// would default to unapproved along with everything else, locking the
// real owner out of their own dashboard. Run once, right after
// `npx prisma db push`, before testing anything else. Run with:
//   npx tsx prisma/approve-real-business.ts
import { prisma } from "../lib/prisma";

async function main() {
  const business = await prisma.business.update({
    where: { slug: "tee-to-green-golf" },
    data: { approved: true },
  });
  console.log(`Marked "${business.name}" as approved. Done.`);
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
