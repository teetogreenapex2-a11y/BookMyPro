// Finds any business with no owner left at all - the real, likely
// leftover from the fake account testing the *old* "I'm a coach or
// instructor" flow before tonight's new request-and-approve system
// existed, which created its own separate business entirely rather than
// requesting to join Tee to Green Golf. Read-only - just reports what it
// finds, doesn't delete anything.
import { prisma } from "../lib/prisma";

async function main() {
  const businesses = await prisma.business.findMany({
    include: { memberships: true },
  });

  console.log(`Found ${businesses.length} business(es) total.\n`);

  for (const b of businesses) {
    const owners = b.memberships.filter((m) => m.role === "owner");
    const flag = owners.length === 0 ? "  <-- NO OWNER (likely orphaned)" : "";
    console.log(`${b.slug} — "${b.name}" — ${b.memberships.length} membership(s), ${owners.length} owner(s)${flag}`);
  }
}

main()
  .catch((err) => {
    console.error("Something went wrong:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
