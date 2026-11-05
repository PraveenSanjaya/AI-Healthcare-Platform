import { auth } from "@/auth";
import { handleGenerate, type GenerateDeps } from "@/lib/ai/generate";
import { getProvider } from "@/lib/ai/providers";
import { loadClinicProfile, prismaGenerationRepo, writeAudit } from "@/lib/ai/repo";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  return handleGenerate(deps(), await auth(), body);
}
