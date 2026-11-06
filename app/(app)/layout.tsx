import Link from "next/link";
import { Suspense } from "react";
import { auth, signOut } from "@/auth";
import { hasRole } from "@/lib/auth/roles";

async function Nav() {
  const session = await auth();
  const user = session?.user;
  return (
    <nav
      aria-label="Main"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 text-sm sm:px-6"
    >
      <Link href="/dashboard" className="font-semibold">
        ClinicAssist
      </Link>
      <Link href="/templates">Templates</Link>
      <Link href="/history">History</Link>
      {user && hasRole(user.role, "MANAGER") && <Link href="/analytics">Analytics</Link>}
      {user && hasRole(user.role, "MANAGER") && <Link href="/admin/settings">Settings</Link>}
      {user && hasRole(user.role, "ADMIN") && <Link href="/admin/templates">Manage templates</Link>}
      {user && hasRole(user.role, "ADMIN") && <Link href="/admin/users">Users</Link>}
      {user && hasRole(user.role, "ADMIN") && <Link href="/admin/audit">Audit log</Link>}
      <span className="text-muted-foreground max-w-full truncate sm:ml-auto">{user?.email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button className="rounded border px-2 py-1">Sign out</button>
      </form>
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-12 border-b" />}>
        <Nav />
      </Suspense>
      {children}
    </>
  );
}
