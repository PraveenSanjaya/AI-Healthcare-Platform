import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import { prismaUserRepo } from "@/lib/users/repo";
import { listUsers } from "@/lib/users/service";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "ADMIN")) redirect("/dashboard");
  const users = await listUsers(session, prismaUserRepo);
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">User management</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Role</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow
              key={u.id}
              id={u.id}
              name={u.name}
              email={u.email}
              role={u.role}
              active={u.active}
              isSelf={u.id === session.user.id}
            />
          ))}
        </tbody>
      </table>
      <section>
        <h2 className="mb-3 text-lg font-medium">Create user</h2>
        <CreateUserForm />
      </section>
    </main>
  );
}
