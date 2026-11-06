import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/guards";
import { auditRepo } from "@/lib/audit/repo";
import { exportAuditCsv, parseAuditFilters } from "@/lib/audit/service";

/** GET /api/audit/export?action=&actor=&from=&to= : the filtered audit log as CSV (ADMIN only). */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const { csv, filename } = await exportAuditCsv(
      await auth(),
      { repo: auditRepo, audit: auditRepo.create, now: () => new Date() },
      parseAuditFilters(params),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      const forbidden = e.code === "FORBIDDEN";
      return Response.json(
        { error: forbidden ? "FORBIDDEN" : "UNAUTHENTICATED" },
        { status: forbidden ? 403 : 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw e;
  }
}
