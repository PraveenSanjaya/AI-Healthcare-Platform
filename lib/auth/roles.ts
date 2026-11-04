export const ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;
export type AppRole = (typeof ROLES)[number];

const RANK: Record<AppRole, number> = { STAFF: 1, MANAGER: 2, ADMIN: 3 };

export function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least as privileged as `min`. Unknown roles never pass. */
export function hasRole(role: unknown, min: AppRole): boolean {
  return isRole(role) && RANK[role] >= RANK[min];
}
