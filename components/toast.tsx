"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Kind = "success" | "error";
type Toast = { id: number; kind: Kind; message: string };
type Push = (message: string, kind?: Kind) => void;

const ToastContext = createContext<Push>(() => {});

/** Show a short message in the corner. Safe to call when no provider is mounted. */
export const useToast = () => useContext(ToastContext);

const LIFETIME_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const push = useCallback<Push>((message, kind = "success") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, kind, message }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Always mounted so screen readers announce what is added. */}
      <div
        data-testid="toasts"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={
              "pointer-events-auto max-w-sm rounded-md border px-3 py-2 text-sm shadow-md " +
              (t.kind === "error"
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                : "bg-background text-foreground")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
