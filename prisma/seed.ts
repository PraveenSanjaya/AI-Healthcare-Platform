import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { seedAdmin } from "../lib/seed/admin";

async function main() {
  const admin = await seedAdmin(process.env, ({ email, create, update }) =>
    prisma.user.upsert({
      where: { email },
      create,
      update,
      select: { id: true, email: true },
    }),
  );
  console.log(`Admin ready: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
