import { NextResponse } from "next/server";
import { auth } from "./auth";
import { decideAccess } from "@/lib/auth/route-access";
import { isRole } from "@/lib/auth/roles";

export default auth((req) => {
  const r = req.auth?.user?.role;
  const role = isRole(r) ? r : null;
  const d = decideAccess(req.nextUrl.pathname, role);
  if (d.action === "redirect") return NextResponse.redirect(new URL(d.to, req.nextUrl));
  if (d.action === "forbidden") return new NextResponse("Forbidden", { status: 403 });
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
