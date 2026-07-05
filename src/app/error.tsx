"use client";

import { useEffect } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        url: window.location.href,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-wash text-destructive">
          <TriangleAlert className="size-6" strokeWidth={1.8} />
        </span>
        <h2 className="mt-4 font-display text-[26px] font-semibold text-ink">
          Algo deu errado
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          O erro foi registrado e vamos investigar. Tente novamente — se
          persistir, fale com o administrador.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px active:translate-y-0"
        >
          <RefreshCcw className="size-4" />
          Tentar novamente
        </button>
        {error.digest && (
          <p className="mt-4 font-mono text-[10.5px] text-ink-faint">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
