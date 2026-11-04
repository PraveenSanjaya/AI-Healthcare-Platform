"use client";

import { useState, useTransition } from "react";
import { ROLES } from "@/lib/auth/roles";
import { changeRoleAction, setActiveAction, type ActionResult } from "./actions";

type Props = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  isSelf: boolean;
};

export function UserRow({ id, name, email, role, active, isSelf }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const handle = (p: Promise<ActionResult>) =>
    start(async () => {
      const r = await p;
      setError(r.ok ? null : r.error);
    });
  return (
    <tr className="border-t">
      <td className="p-2">
        {name}
        {isSelf && " (you)"}
      </td>
      <td className="p-2">{email}</td>
      <td className="p-2">
        <select
          aria-label={`Role for ${email}`}
          value={role}
          disabled={isSelf || pending}
          onChange={(e) => handle(changeRoleAction(id, e.target.value))}
          className="rounded border px-2 py-1"
        >
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <button
          disabled={(isSelf && active) || pending}
          onClick={() => handle(setActiveAction(id, !active))}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          {active ? "Deactivate" : "Activate"}
        </button>
        {error && (
          <span role="alert" className="ml-2 text-sm text-red-600">
            {error}
          </span>
        )}
      </td>
    </tr>
  );
}
