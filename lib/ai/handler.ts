import { handleGenerate, type GenerateDeps } from "./generate";
import { handleRefine } from "./refine";

type SessionLike = Parameters<typeof handleGenerate>[1];

/** POST /api/generate: a body with `generationId` refines, anything else generates. */
export function handleRequest(deps: GenerateDeps, session: SessionLike, body: unknown) {
  const refine =
    typeof body === "object" &&
    body !== null &&
    "generationId" in (body as Record<string, unknown>);
  return refine ? handleRefine(deps, session, body) : handleGenerate(deps, session, body);
}
