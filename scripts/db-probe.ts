import "dotenv/config";
import { prisma } from "../lib/db/prisma";

/**
 * Exit code 0 when the database answers a join query, 1 otherwise. The local `prisma dev`
 * database can degrade so that simple queries work but joins kill the connection.
 */
async function main() {
  await prisma.template.findFirst({ include: { category: true, currentVersion: true } });
}

main()
  .then(() => prisma.$disconnect())
  .catch(() => {
    process.exitCode = 1;
  });
