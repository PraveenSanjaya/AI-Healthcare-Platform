import { auth } from "@/auth";
import type { GenerateDeps } from "@/lib/ai/generate";
import { handleRequest } from "@/lib/ai/handler";
import { getProvider } from "@/lib/ai/providers";
import { loadClinicProfile, prismaGenerationRepo, writeAudit } from "@/lib/ai/repo";
import { errorResponse, readJsonLimited } from "@/lib/http/body";
import { prismaTemplateRepo } from "@/lib/templates/repo";

export const maxDuration = 120;

function deps(): GenerateDeps {
  return {
    templates: prismaTemplateRepo,
    generations: prismaGenerationRepo,
    audit: writeAudit,
    profile: loadClinicProfile,
    provider: getProvider(),
    env: process.env,
    now: () => new Date(),
  };
}

export async function POST(request: Request) {
  try {
    const parsed = await readJsonLimited(request);
    if (!parsed.ok && parsed.status === 413) {
      return errorResponse(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
    }
    // Unparseable JSON is handled as an empty body: sign-in is checked first, then 400.
    return await handleRequest(deps(), await auth(), parsed.ok ? parsed.body : undefined);
  } catch (e) {
    console.error("POST /api/generate failed:", e instanceof Error ? e.message : "unknown error");
    return errorResponse(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
}
