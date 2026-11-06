"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildFormSchema, defaultValues, type FormValues } from "@/lib/ai/client/form";
import {
  describeRetry,
  failureFrom,
  readLines,
  type GenerateFailure,
  type GenerateRequestBody,
} from "@/lib/ai/client/stream";
import type { ClinicProfileData } from "@/lib/ai/profile";
import type { RenderableVersion } from "@/lib/ai/render";
import { findPhiInInputs, redactAllInputs } from "@/lib/safety/inputs";
import { DraftActions } from "./draft-actions";
import { DraftViewer } from "./draft-viewer";
import { VariableField } from "./fields";
import { FieldPhiNotice, PhiSummary } from "./phi-check";
import { PromptPanel } from "./prompt-panel";

export type RunnerProps = {
  slug: string;
  title: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  version: RenderableVersion;
  profile: ClinicProfileData;
  isAdmin: boolean;
  /** A saved draft being reopened from History (your own generations only). */
  initial?: {
    generationId: string;
    inputs: Record<string, string>;
    draft: string;
    refinements: string[];
    reviewed: boolean;
  };
};

type Phase = "idle" | "streaming" | "done";

export function Runner(props: RunnerProps) {
  const { slug } = props;
  const variables = props.version.variables;
  const schema = useMemo(() => buildFormSchema(variables), [variables]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { ...defaultValues(variables, props.profile), ...props.initial?.inputs },
    mode: "onChange",
  });
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form;

  // Live PHI check: runs on every keystroke, in the browser; the server checks again.
  const values = useWatch({ control }) as FormValues;
  const findings = useMemo(() => findPhiInInputs(values), [values]);
  const [reason, setReason] = useState("");
  const overrideReason = props.isAdmin ? reason.trim() : "";
  const overridden = findings.length > 0 && overrideReason.length >= 10;
  const blocked = findings.length > 0 && !overridden;

  function redactAll() {
    const redacted = redactAllInputs(values);
    for (const [name, value] of Object.entries(redacted)) {
      if (value !== values[name])
        setValue(name, value, { shouldValidate: true, shouldDirty: true });
    }
  }

  const [phase, setPhase] = useState<Phase>(props.initial ? "done" : "idle");
  const [draft, setDraft] = useState(props.initial?.draft ?? "");
  const [failure, setFailure] = useState<GenerateFailure | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(
    props.initial?.generationId ?? null,
  );
  const [reviewed, setReviewed] = useState(props.initial?.reviewed ?? false);
  const [refinements, setRefinements] = useState<string[]>(props.initial?.refinements ?? []);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function run(body: GenerateRequestBody) {
    const refining = "generationId" in body;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    if (!refining) {
      // A new generation starts clean; a refinement keeps the old draft until text arrives.
      setDraft("");
      setGenerationId(null);
      setReviewed(false);
      setRefinements([]);
    }
    setPhase("streaming");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setFailure(await failureFrom(res));
        setPhase(refining ? "done" : "idle");
        return;
      }
      let text = "";
      for await (const line of readLines(res.body)) {
        if (line.type === "text") {
          text += line.text;
          setDraft(text);
        } else if (line.type === "error") {
          setFailure({ kind: "message", message: line.message });
          setPhase(refining || text ? "done" : "idle");
          return;
        } else if (line.type === "done") {
          setGenerationId(line.generationId);
          setReviewed(false);
          if (refining) setRefinements((r) => [...r, body.instruction]);
        }
      }
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFailure({ kind: "message", message: "The connection was lost. Try again." });
      setPhase(refining ? "done" : "idle");
    }
  }

  function submit(e?: React.BaseSyntheticEvent) {
    return handleSubmit((inputs) =>
      run({ slug, inputs, ...(overridden ? { override: { reason: overrideReason } } : {}) }),
    )(e);
  }
  function onGenerate(e: React.FormEvent<HTMLFormElement>) {
    void submit(e);
  }
  function refine(instruction: string) {
    if (!generationId) return;
    void run({
      slug,
      generationId,
      instruction,
      ...(overrideReason.length >= 10 ? { override: { reason: overrideReason } } : {}),
    });
  }
  const busy = phase === "streaming";

  return (
    <div className="space-y-6">
      <form onSubmit={onGenerate} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">Run this template</h2>
        {variables.map((v) => (
          <VariableField key={v.name} variable={v} register={register} error={errors[v.name]}>
            <FieldPhiNotice
              value={values[v.name] ?? ""}
              findings={findings.filter((f) => f.field === v.name)}
            />
          </VariableField>
        ))}
        <PhiSummary
          findings={findings}
          isAdmin={props.isAdmin}
          reason={reason}
          onReason={setReason}
          onRedactAll={redactAll}
        />
        <PromptPanel version={props.version} values={values} profile={props.profile} />
        <button
          type="submit"
          disabled={busy || blocked}
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 disabled:opacity-50"
        >
          {busy ? "Generating…" : overridden ? "Generate with override" : "Generate"}
        </button>
      </form>
      {failure && <FailureMessage failure={failure} />}
      <DraftViewer
        text={draft}
        streaming={busy}
        maxWords={props.version.maxWords ?? null}
        maxChars={props.version.maxChars ?? null}
      />
      <DraftActions
        audience={props.audience}
        draft={draft}
        ready={phase === "done" && generationId !== null && draft !== ""}
        generationId={generationId}
        reviewed={reviewed}
        onReviewed={() => setReviewed(true)}
        busy={busy}
        onRegenerate={() => void submit()}
        regenerateDisabled={blocked}
        onRefine={refine}
        overrideActive={overrideReason.length >= 10}
        refinements={refinements}
      />
    </div>
  );
}

function FailureMessage({ failure }: { failure: GenerateFailure }) {
  let message: string;
  if (failure.kind === "auth") message = "Your session has expired. Please sign in again.";
  else if (failure.kind === "rate-limit")
    message = `You have reached the hourly limit. Try again in ${describeRetry(failure.retryAfterSeconds)}.`;
  else if (failure.kind === "phi")
    message = "Personal or health information was found, so nothing was sent.";
  else message = failure.message;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </p>
  );
}
