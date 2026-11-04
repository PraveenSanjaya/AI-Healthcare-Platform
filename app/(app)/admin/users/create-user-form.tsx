"use client";

import { useActionState } from "react";
import { ROLES } from "@/lib/auth/roles";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="grid max-w-md gap-3">
      <input name="name" placeholder="Name" required className="rounded-md border px-3 py-2" />
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="rounded-md border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Temporary password (12+ chars)"
        required
        autoComplete="new-password"
        className="rounded-md border px-3 py-2"
      />
      <select name="role" defaultValue="STAFF" className="rounded-md border px-3 py-2">
        {ROLES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-green-700">User created.</p>}
      <button
        disabled={pending}
        className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
