"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
import type { TemplateVariable } from "@/lib/templates/types";
import { DraftViewer } from "./draft-viewer";
import { VariableField } from "./fields";

export type RunnerProps = {
  slug: string;
  title: string;
  audience: "INTERNAL" | "PATIENT_FACING";
  variables: TemplateVariable[];
  maxWords: number | null;
  maxChars: number | null;
  profile: ClinicProfileData;
  isAdmin: boolean;
};

type Phase = "idle" | "streaming" | "done";

export function Runner(props: RunnerProps) {
  const { slug, variables } = props;
  const schema = useMemo(() => buildFormSchema(variables), [variables]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: defaultValues(variables, props.profile),
    mode: "onChange",
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<GenerateFailure | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function run(body: GenerateRequestBody) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFailure(null);
    setDraft("");
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
        setPhase("idle");
        return;
      }
      let text = "";
      for await (const line of readLines(res.body)) {
        if (line.type === "text") {
          text += line.text;
          setDraft(text);
        } else if (line.type === "error") {
          setFailure({ kind: "message", message: line.message });
          setPhase("idle");
          return;
        }
      }
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFailure({ kind: "message", message: "The connection was lost. Try again." });
      setPhase("idle");
    }
  }

  function onGenerate(e: React.FormEvent<HTMLFormElement>) {
    void handleSubmit((values) => run({ slug, inputs: values }))(e);
  }
  const busy = phase === "streaming";

  return (
    <div className="space-y-6">
      <form onSubmit={onGenerate} className="space-y-4" noValidate>
        <h2 className="text-lg font-semibold">Run this template</h2>
        {variables.map((v) => (
          <VariableField key={v.name} variable={v} register={register} error={errors[v.name]} />
        ))}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </form>
      {failure && <FailureMessage failure={failure} />}
      <DraftViewer text={draft} streaming={busy} />
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
    <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  );
}
