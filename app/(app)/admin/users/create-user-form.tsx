"use client";

import { useActionState } from "react";
import { ROLES } from "@/lib/auth/roles";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="grid max-w-md gap-3">
      <input
        name="name"
        placeholder="Name"
        aria-label="Name"
        required
        className="rounded-md border px-3 py-2"
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        aria-label="Email"
        required
        className="rounded-md border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Temporary password (12+ chars)"
        aria-label="Temporary password"
        required
        autoComplete="new-password"
        className="rounded-md border px-3 py-2"
      />
      <select
        name="role"
        aria-label="Role"
        defaultValue="STAFF"
        className="rounded-md border px-3 py-2"
      >
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-green-700 dark:text-green-300">User created.</p>}
      <button
        disabled={pending}
        className="bg-primary text-primary-foreground rounded-md px-3 py-2 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
