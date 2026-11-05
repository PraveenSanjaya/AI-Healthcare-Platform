"use client";

import type { FieldError, UseFormRegister } from "react-hook-form";
import type { FormValues } from "@/lib/ai/client/form";
import type { TemplateVariable } from "@/lib/templates/types";

const control = "mt-1 w-full rounded-md border px-3 py-2 font-normal";

/** One form control for a template variable, chosen by the variable's type. */
export function VariableField({
  variable,
  register,
  error,
  children,
}: {
  variable: TemplateVariable;
  register: UseFormRegister<FormValues>;
  error?: FieldError;
  /** Rendered under the control (the live PHI check). */
  children?: React.ReactNode;
}) {
  const id = `var-${variable.name}`;
  const helpId = `${id}-help`;
  const errId = `${id}-error`;
  const describedBy = [variable.helpText && helpId, error && errId].filter(Boolean).join(" ");
  const common = {
    id,
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
    ...register(variable.name),
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {variable.label}
        {!variable.required && <span className="font-normal text-gray-600"> (optional)</span>}
        {variable.fromProfile && (
          <span className="font-normal text-gray-600">
            {" "}
            · from clinic profile, you can change it
          </span>
        )}
      </label>
      {variable.type === "textarea" && <textarea rows={3} className={control} {...common} />}
      {variable.type === "longtext-paste" && <textarea rows={8} className={control} {...common} />}
      {variable.type === "select" && (
        <select className={control} {...common}>
          <option value="">Select…</option>
          {variable.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {variable.type === "number" && (
        <input type="text" inputMode="decimal" className={control} {...common} />
      )}
      {variable.type === "text" && <input type="text" className={control} {...common} />}
      {variable.helpText && (
        <p id={helpId} className="text-sm text-gray-600">
          {variable.helpText}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}
      {children}
    </div>
  );
}
