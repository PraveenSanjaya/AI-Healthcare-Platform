import { z } from "zod";
import { AuthError, requireUser, type SessionUser } from "@/lib/auth/guards";
import { findPhiInInputs, type PhiFindingDto } from "@/lib/safety/inputs";
import {
  TemplateNotFoundError,
  getTemplate,
  type LibraryItem,
  type TemplateRepo,
} from "@/lib/templates/service";
import { variableSchema } from "@/lib/templates/types";
import type { ClinicProfileData } from "./profile";
import { RenderError, renderTemplate, type RenderableVersion } from "./render";
import { buildSystemPrompt } from "./systemPrompt";
import { ProviderError, type ChatMessage, type LLMProvider, type Usage } from "./providers/types";
import { checkRateLimit, rateLimitPerHour, rateLimitWindowStart } from "./rate-limit";

export const AUDIT = {
  GENERATION_CREATED: "GENERATION_CREATED",
  GENERATION_REFINED: "GENERATION_REFINED",
  GENERATION_REVIEWED: "GENERATION_REVIEWED",
  PHI_BLOCKED: "PHI_BLOCKED",
  PHI_OVERRIDE: "PHI_OVERRIDE",
} as const;

export type AuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export type GenerationRepo = {
  usageSince(userId: string, since: Date): Promise<{ count: number; oldest: Date | null }>;
  create(data: {
    userId: string;
    templateVersionId: string;
    inputs: Record<string, string>;
    renderedPrompt: string;
    output: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<string>;
  find(id: string): Promise<GenerationRecord | null>;
  /** Changes the text, so any earlier review no longer applies and is cleared. */
  addRefinement(generationId: string, instruction: string, output: string): Promise<string>;
  markReviewed(id: string, at: Date): Promise<void>;
};

export type GenerationRecord = {
  id: string;
  userId: string;
  templateVersionId: string;
  inputs: Record<string, string>;
  renderedPrompt: string;
  output: string;
  refinements: { instruction: string; output: string }[];
  reviewed: boolean;
  reviewedAt: Date | null;
};

export type GenerateDeps = {
  templates: TemplateRepo;
  generations: GenerationRepo;
  audit: (entry: AuditEntry) => Promise<void>;
  profile: () => Promise<ClinicProfileData>;
  provider: LLMProvider;
  env: Record<string, string | undefined>;
  now: () => Date;
};

type SessionLike = Parameters<typeof requireUser>[0];

const MAX_FIELD_CHARS = 50_000;
const MAX_OUTPUT_TOKENS = 4096;

export const generateBodySchema = z.object({
  slug: z.string().min(1).max(200),
  inputs: z.record(z.string().max(100), z.string().max(MAX_FIELD_CHARS)),
  override: z.object({ reason: z.string().trim().min(10).max(500) }).optional(),
});

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export { findPhiInInputs, type PhiFindingDto };

export const maxTokensFor = (maxWords?: number | null) =>
  maxWords ? Math.min(MAX_OUTPUT_TOKENS, Math.ceil(maxWords * 2.5) + 256) : MAX_OUTPUT_TOKENS;

const phiSummary = (findings: PhiFindingDto[]) => ({
  count: findings.length,
  types: [...new Set(findings.map((f) => f.type))].sort(),
  fields: [...new Set(findings.map((f) => f.field))].sort(),
});

/** One NDJSON line per event: text, then done (with the saved id) or error. */
export type StreamLine =
  | { type: "text"; text: string }
  | { type: "done"; generationId: string; refinementId?: string; usage: Usage }
  | { type: "error"; message: string };

export function ndjsonResponse(run: (send: (line: StreamLine) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (line: StreamLine) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      };
      try {
        await run(send);
      } catch (e) {
        send({
          type: "error",
          message:
            e instanceof ProviderError ? e.message : "Something went wrong while generating.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Everything that must pass before any model call; shared by generate and refine. */
export async function gate(
  deps: GenerateDeps,
  session: SessionLike,
  slug: string,
): Promise<
  | {
      ok: true;
      user: SessionUser;
      template: LibraryItem;
      version: RenderableVersion & { id: string };
    }
  | { ok: false; response: Response }
> {
  let user: SessionUser;
  try {
    user = requireUser(session);
  } catch (e) {
    if (e instanceof AuthError)
      return { ok: false, response: json({ error: "UNAUTHENTICATED" }, 401) };
    throw e;
  }
  let template: LibraryItem;
  try {
    template = await getTemplate(session, deps.templates, slug);
  } catch (e) {
    if (e instanceof TemplateNotFoundError)
      return { ok: false, response: json({ error: "TEMPLATE_NOT_FOUND" }, 404) };
    throw e;
  }
  const current = template.current;
  const variables = z.array(variableSchema).safeParse(current?.variables);
  if (!current || !variables.success) {
    return { ok: false, response: json({ error: "TEMPLATE_UNAVAILABLE" }, 409) };
  }
  const now = deps.now();
  const usage = await deps.generations.usageSince(user.id, rateLimitWindowStart(now));
  const limit = checkRateLimit({
    count: usage.count,
    oldest: usage.oldest,
    limit: rateLimitPerHour(deps.env),
    now,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      response: json({ error: "RATE_LIMITED", retryAfterSeconds: limit.retryAfterSeconds }, 429, {
        "Retry-After": String(limit.retryAfterSeconds),
      }),
    };
  }
  return { ok: true, user, template, version: { ...current, variables: variables.data } };
}

/**
 * Apply the PHI policy to free text the user typed. Returns a Response to send when the
 * request must stop, or null to continue. Matched text is never written to the audit log.
 */
export async function enforcePhiPolicy(
  deps: GenerateDeps,
  user: SessionUser,
  template: LibraryItem,
  findings: PhiFindingDto[],
  override: { reason: string } | undefined,
): Promise<Response | null> {
  if (findings.length === 0) return null;
  const base = { templateSlug: template.slug, ...phiSummary(findings) };
  if (override && user.role === "ADMIN") {
    await deps.audit({
      actorId: user.id,
      action: AUDIT.PHI_OVERRIDE,
      entityType: "Template",
      entityId: template.id,
      metadata: { ...base, reason: override.reason },
    });
    return null;
  }
  await deps.audit({
    actorId: user.id,
    action: AUDIT.PHI_BLOCKED,
    entityType: "Template",
    entityId: template.id,
    metadata: { ...base, overrideRejected: Boolean(override) },
  });
  if (override) {
    return json(
      { error: "OVERRIDE_FORBIDDEN", message: "Only an administrator can override." },
      403,
    );
  }
  return json({ error: "PHI_DETECTED", findings }, 422);
}

export async function handleGenerate(
  deps: GenerateDeps,
  session: SessionLike,
  rawBody: unknown,
): Promise<Response> {
  // Authentication comes first so a signed-out caller learns nothing about the schema.
  try {
    requireUser(session);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: "UNAUTHENTICATED" }, 401);
    throw e;
  }
  const body = generateBodySchema.safeParse(rawBody);
  if (!body.success) {
    return json({ error: "INVALID_REQUEST", issues: body.error.issues.map((i) => i.message) }, 400);
  }
  const gated = await gate(deps, session, body.data.slug);
  if (!gated.ok) return gated.response;
  const { user, template, version } = gated;
  const { inputs, override } = body.data;

  const declared = new Set(version.variables.map((v) => v.name));
  const unknown = Object.keys(inputs).filter((k) => !declared.has(k));
  if (unknown.length) {
    return json(
      { error: "INVALID_INPUTS", message: `Unknown input(s): ${unknown.join(", ")}.` },
      400,
    );
  }

  const profile = await deps.profile();
  let rendered;
  try {
    rendered = renderTemplate(version, inputs, profile);
  } catch (e) {
    if (e instanceof RenderError) {
      return json({ error: "INVALID_INPUTS", message: e.message, missing: e.missing }, 400);
    }
    throw e;
  }

  const stop = await enforcePhiPolicy(deps, user, template, findPhiInInputs(inputs), override);
  if (stop) return stop;

  const system = buildSystemPrompt(profile, { role: rendered.role });
  const messages: ChatMessage[] = [{ role: "user", content: rendered.prompt }];

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

    const generationId = await deps.generations.create({
      userId: user.id,
      templateVersionId: version.id,
      inputs,
      renderedPrompt: rendered.prompt,
      output,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    await deps.audit({
      actorId: user.id,
      action: AUDIT.GENERATION_CREATED,
      entityType: "Generation",
      entityId: generationId,
      metadata: {
        templateSlug: template.slug,
        provider: deps.provider.name,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
    send({ type: "done", generationId, usage });
  });
}
