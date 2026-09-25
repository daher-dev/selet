"use client";

import { useEffect, useRef } from "react";
import { isMissingServerActionError } from "@/lib/server-action-error";

/**
 * Last-resort boundary: replaces the root layout when it crashes, so no
 * theme/font classes are available — inline styles only.
 */
export default function GlobalError({
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
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f8ef",
          color: "#15231c",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h2 style={{ fontSize: 22, margin: 0 }}>
            {missingServerAction ? "Atualizando a página" : "Algo deu errado"}
          </h2>
          <p style={{ fontSize: 14, color: "#5c6b61" }}>
            {missingServerAction
              ? "A página ficou desatualizada depois de uma publicação. Vamos recarregar para tentar de novo."
              : "O erro foi registrado. Tente novamente."}
          </p>
          <button
            type="button"
            onClick={missingServerAction ? () => window.location.reload() : reset}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              background: "#186b41",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {missingServerAction ? "Atualizar página" : "Tentar novamente"}
          </button>
        </div>
      </body>
    </html>
  );
}
