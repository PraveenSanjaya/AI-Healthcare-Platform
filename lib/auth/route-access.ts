import { hasRole, type AppRole } from "./roles";

export type AccessDecision =
  | { action: "allow" }
  | { action: "redirect"; to: string }
  | { action: "forbidden" }
  | { action: "unauthorized" };

const PUBLIC_PREFIXES = ["/login", "/api/auth"];

/** Pure routing policy used by proxy.ts: who may see which path. */
export function decideAccess(pathname: string, role: AppRole | null): AccessDecision {
  const isPublic =
    pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) {
    if (role && pathname === "/login") return { action: "redirect", to: "/dashboard" };
    return { action: "allow" };
  }
  if (!role && (pathname === "/api" || pathname.startsWith("/api/"))) {
    // API clients get a status code, not a redirect to the login page.
    return { action: "unauthorized" };
  }
  if (!role) {
    return { action: "redirect", to: `/login?callbackUrl=${encodeURIComponent(pathname)}` };
  }
  // Managers may use the clinic settings page; everything else under /admin is admin-only.
  if (pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")) {
    return hasRole(role, "MANAGER") ? { action: "allow" } : { action: "forbidden" };
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return hasRole(role, "ADMIN") ? { action: "allow" } : { action: "forbidden" };
  }
  return { action: "allow" };
}
