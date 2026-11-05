import { auth } from "@/auth";
import { writeAudit } from "@/lib/ai/repo";
import { handleExport } from "@/lib/export/service";
import { prismaHistoryRepo } from "@/lib/history/repo";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format");
  return handleExport(
    { history: prismaHistoryRepo, audit: writeAudit, now: () => new Date() },
    await auth(),
    id,
    format,
  );
}
