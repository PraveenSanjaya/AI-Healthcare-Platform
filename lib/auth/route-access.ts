import { hasRole, type AppRole } from "./roles";

export type AccessDecision =
  { action: "allow" } | { action: "redirect"; to: string } | { action: "forbidden" };

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

/** Pure routing policy used by proxy.ts: who may see which path. */
export function decideAccess(pathname: string, role: AppRole | null): AccessDecision {
  const isPublic =
    pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) {
    if (role && pathname === "/login") return { action: "redirect", to: "/dashboard" };
    return { action: "allow" };
  }
  if (!role) {
    return { action: "redirect", to: `/login?callbackUrl=${encodeURIComponent(pathname)}` };
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return hasRole(role, "ADMIN") ? { action: "allow" } : { action: "forbidden" };
  }
  return { action: "allow" };
}
