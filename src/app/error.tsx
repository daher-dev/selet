"use client";

import { useEffect, useRef } from "react";
import { RefreshCcw, TriangleAlert } from "lucide-react";
import { isMissingServerActionError } from "@/lib/server-action-error";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const missingServerAction = isMissingServerActionError(error);
  const reloadedRef = useRef(false);

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
    if (missingServerAction && !reloadedRef.current) {
      reloadedRef.current = true;
      window.location.reload();
    }
  }, [error, missingServerAction]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-wash text-destructive">
          <TriangleAlert className="size-6" strokeWidth={1.8} />
        </span>
        <h2 className="mt-4 font-display text-[26px] font-semibold text-ink">
          {missingServerAction ? "Atualizando a página" : "Algo deu errado"}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {missingServerAction
            ? "A página ficou desatualizada depois de uma publicação. Vamos recarregar para tentar de novo."
            : "O erro foi registrado e vamos investigar. Tente novamente — se persistir, fale com o administrador."}
        </p>
        <button
          type="button"
          onClick={missingServerAction ? () => window.location.reload() : reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px active:translate-y-0"
        >
          <RefreshCcw className="size-4" />
          {missingServerAction ? "Atualizar página" : "Tentar novamente"}
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
