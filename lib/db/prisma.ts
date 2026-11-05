import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // DB_POOL_MAX caps concurrent connections. The local `prisma dev` database copes better
  // with a small pool (2-3); leave it unset in production to use the driver default.
  const max = Number(process.env.DB_POOL_MAX);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ...(Number.isInteger(max) && max > 0 ? { max } : {}),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
