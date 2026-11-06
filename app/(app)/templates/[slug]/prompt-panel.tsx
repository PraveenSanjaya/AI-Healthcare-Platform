"use client";

import { useMemo } from "react";
import { RenderError, renderTemplate, type RenderableVersion } from "@/lib/ai/render";
import type { ClinicProfileData } from "@/lib/ai/profile";
import { buildSystemPrompt } from "@/lib/ai/systemPrompt";

/** Collapsible preview of exactly what the first request sends: system prompt and user message. */
export function PromptPanel({
  version,
  values,
  profile,
}: {
  version: RenderableVersion;
  values: Record<string, string>;
  profile: ClinicProfileData;
}) {
  const result = useMemo(() => {
    try {
      const rendered = renderTemplate(version, values, profile);
      return {
        ok: true as const,
        system: buildSystemPrompt(profile, { role: rendered.role }),
        user: rendered.prompt,
      };
    } catch (e) {
      if (e instanceof RenderError) return { ok: false as const, message: e.message };
      throw e;
    }
  }, [version, values, profile]);

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">View full prompt</summary>
      <div className="mt-3 space-y-3 text-sm">
        {result.ok ? (
          <>
            <section>
              <h3 className="font-semibold">System prompt</h3>
              <pre className="bg-muted mt-1 overflow-x-auto rounded p-3 whitespace-pre-wrap">
                {result.system}
              </pre>
            </section>
            <section>
              <h3 className="font-semibold">Message</h3>
              <pre className="bg-muted mt-1 overflow-x-auto rounded p-3 whitespace-pre-wrap">
                {result.user}
              </pre>
            </section>
          </>
        ) : (
          <p className="text-muted-foreground">
            {result.message} The prompt appears once the form is complete.
          </p>
        )}
      </div>
    </details>
  );
}
