import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth/guards";
import {
  AUDIT,
  enforcePhiPolicy,
  findPhiInInputs,
  gate,
  maxTokensFor,
  ndjsonResponse,
  type GenerateDeps,
} from "./generate";
import { ProviderError, type ChatMessage, type Usage } from "./providers/types";
import { RenderError, renderTemplate } from "./render";
import { buildSystemPrompt } from "./systemPrompt";

export const refineBodySchema = z.object({
  slug: z.string().min(1).max(200),
  generationId: z.string().min(1).max(100),
  instruction: z.string().trim().min(1).max(2000),
  override: z.object({ reason: z.string().trim().min(10).max(500) }).optional(),
});

type SessionLike = Parameters<typeof requireUser>[0];

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Follow-up instruction on a saved generation. The conversation sent to the model is the
 * original prompt and answer plus every earlier refinement, so it really continues.
 */
export async function handleRefine(
  deps: GenerateDeps,
  session: SessionLike,
  rawBody: unknown,
): Promise<Response> {
  try {
    requireUser(session);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: "UNAUTHENTICATED" }, 401);
    throw e;
  }
  const body = refineBodySchema.safeParse(rawBody);
  if (!body.success) {
    return json({ error: "INVALID_REQUEST", issues: body.error.issues.map((i) => i.message) }, 400);
  }
  const { slug, generationId, instruction, override } = body.data;

  const gated = await gate(deps, session, slug);
  if (!gated.ok) return gated.response;
  const { user, template, version } = gated;

  const generation = await deps.generations.find(generationId);
  // Someone else's generation is reported exactly like a missing one.
  if (!generation || generation.userId !== user.id) {
    return json({ error: "GENERATION_NOT_FOUND" }, 404);
  }
  if (generation.templateVersionId !== version.id) {
    return json(
      { error: "TEMPLATE_CHANGED", message: "This template was updated. Generate a new draft." },
      409,
    );
  }

  const stop = await enforcePhiPolicy(
    deps,
    user,
    template,
    findPhiInInputs({ instruction }),
    override,
  );
  if (stop) return stop;

  const profile = await deps.profile();
  let role: string;
  try {
    role = renderTemplate(version, generation.inputs, profile).role;
  } catch (e) {
    if (e instanceof RenderError) {
      return json({ error: "TEMPLATE_CHANGED", message: e.message }, 409);
    }
    throw e;
  }

  const messages: ChatMessage[] = [
    { role: "user", content: generation.renderedPrompt },
    { role: "assistant", content: generation.output },
    ...generation.refinements.flatMap((r): ChatMessage[] => [
      { role: "user", content: r.instruction },
      { role: "assistant", content: r.output },
    ]),
    { role: "user", content: instruction },
  ];
  const system = buildSystemPrompt(profile, { role });

  return ndjsonResponse(async (send) => {
    let output = "";
    let usage: Usage | null = null;
    for await (const event of deps.provider.streamGenerate({
      system,
      messages,
      maxTokens: maxTokensFor(version.maxWords),
      meta: { title: template.title, maxWords: version.maxWords, maxChars: version.maxChars },
    })) {
      if (event.type === "text") {
        output += event.text;
        send({ type: "text", text: event.text });
      } else usage = event.usage;
    }
    if (!usage) throw new ProviderError("The AI provider returned no usage.");

    const refinementId = await deps.generations.addRefinement(generation.id, instruction, output);
    await deps.audit({
      actorId: user.id,
      action: AUDIT.GENERATION_REFINED,
      entityType: "Generation",
      entityId: generation.id,
      metadata: {
        refinementId,
        templateSlug: template.slug,
        provider: deps.provider.name,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
    send({ type: "done", generationId: generation.id, refinementId, usage });
  });
}
