import { prisma } from "@/lib/db/prisma";
import type { UserRepo } from "./service";

const select = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export const prismaUserRepo: UserRepo = {
  list: () => prisma.user.findMany({ select, orderBy: { createdAt: "asc" } }),
  emailExists: async (email) => (await prisma.user.count({ where: { email } })) > 0,
  create: (data) => prisma.user.create({ data, select }),
  update: async (id, data) => {
    try {
      return await prisma.user.update({ where: { id }, data, select });
    } catch {
      return null; // record not found
    }
  },
};
