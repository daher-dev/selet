"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { Loader2, TriangleAlert, CircleX } from "lucide-react";
import { getClientAuth } from "@/lib/firebase-client";
import { SeletLeaf } from "@/components/shell/selet-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Phase = "idle" | "pending" | "denied";

export function LoginPanel() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [deniedEmail, setDeniedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPhase("pending");
    setError(null);
    const auth = getClientAuth();
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      const attemptedEmail = credential.user.email ?? "";
      const idToken = await credential.user.getIdToken();

      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json()) as {
        redirectTo?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 403) {
          setDeniedEmail(attemptedEmail);
          setPhase("denied");
        } else {
          setError(body.error ?? "Não foi possível entrar. Tente novamente.");
          setPhase("idle");
        }
        return;
      }
      router.replace(body.redirectTo ?? "/");
      router.refresh();
      // Keep the "pending" visuals up until navigation takes over.
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "auth/popup-closed-by-user"
      ) {
        setPhase("idle");
        return; // user dismissed the popup — not an error
      }
      setError("Não foi possível entrar. Tente novamente.");
      setPhase("idle");
    } finally {
      // The session cookie is the only credential from here on.
      await signOut(getClientAuth()).catch(() => {});
    }
  }

  const denied = phase === "denied";
  const pending = phase === "pending";

  return (
    <div>
      <span
        className={cn(
          "mb-6 flex size-[52px] items-center justify-center rounded-[14px] text-white",
          denied
            ? "bg-destructive shadow-[0_12px_26px_-12px_rgba(192,73,47,.5)]"
            : "bg-primary shadow-[0_12px_26px_-12px_rgba(24,107,65,.6)]",
        )}
      >
        {denied ? (
          <TriangleAlert className="size-[26px]" strokeWidth={1.9} aria-hidden />
        ) : (
          <SeletLeaf className="size-[26px]" />
        )}
      </span>

      <h1 className="font-display text-[34px] font-semibold leading-[1.1] text-ink">
        {denied ? "Conta sem acesso" : "Bem-vindo de volta"}
      </h1>

      {denied ? (
        <p className="mt-2 mb-6 text-[14px] leading-relaxed text-ink-soft">
          Entramos com <strong className="text-ink">{deniedEmail}</strong>,
          mas esse e-mail não está na equipe Selet.
        </p>
      ) : (
        <p className="mt-2 mb-8 text-[14px] leading-relaxed text-ink-soft">
          {pending
            ? "Confirmando sua conta com o Google…"
            : "Acesse o painel da Selet com sua conta Google."}
        </p>
      )}

      {denied ? (
        <>
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/25 bg-danger-wash p-3.5">
            <CircleX
              className="mt-0.5 size-[17px] shrink-0 text-destructive"
              strokeWidth={1.9}
              aria-hidden
            />
            <p className="text-[12.5px] leading-normal text-destructive/75">
              Se você usa outro e-mail de trabalho, entre com ele. Convites
              são enviados pelo administrador da loja.
            </p>
          </div>

          <button
            type="button"
            onClick={signIn}
            className="flex w-full items-center justify-center gap-3 rounded-[13px] bg-primary px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Tentar com outra conta
          </button>
          <button
            type="button"
            className="mt-2.5 flex w-full items-center justify-center gap-3 rounded-[13px] border-[1.5px] border-input px-4 py-3.5 text-[15px] font-semibold text-ink-soft transition-colors hover:bg-muted"
          >
            Solicitar acesso
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={signIn}
            disabled={pending}
            className={cn(
              "flex w-full items-center justify-center gap-3 rounded-[13px] border-[1.5px] px-4 py-3.5 text-[15px] font-semibold transition-all duration-150 disabled:pointer-events-none",
              pending
                ? "border-input bg-surface text-ink-faint"
                : "border-input bg-white text-ink hover:-translate-y-px hover:border-primary hover:shadow-[0_10px_24px_-14px_rgba(24,107,65,.5)] active:translate-y-0",
            )}
          >
            {pending ? (
              <Loader2 className="size-[19px] animate-spin text-primary" />
            ) : (
              <GoogleIcon />
            )}
            <span>{pending ? "Verificando acesso…" : "Entrar com Google"}</span>
          </button>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-danger-wash px-3.5 py-2.5 text-[12.5px] leading-normal text-destructive"
            >
              {error}
            </p>
          )}

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-ink-faint">
              Acesso exclusivo
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {pending ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5">
              <Skeleton className="size-[34px] shrink-0 rounded-full bg-mint-wash" />
              <span className="flex-1">
                <Skeleton className="h-[10px] w-[70%] rounded-[5px] bg-mint-wash" />
                <Skeleton className="mt-1.5 h-[9px] w-[45%] rounded-[5px] bg-mist" />
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="mt-0.5 shrink-0 text-primary"
                aria-hidden
              >
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <p className="text-[12.5px] leading-normal text-ink-soft">
                Apenas contas autorizadas da equipe Selet. Fale com o
                administrador para solicitar acesso.
              </p>
            </div>
          )}

          <p className="mt-7 text-center text-[12px] leading-normal text-ink-faint">
            Ao entrar, você concorda com os{" "}
            <a href="#" className="font-semibold text-primary hover:underline">
              Termos
            </a>{" "}
            e a{" "}
            <a href="#" className="font-semibold text-primary hover:underline">
              Política de Privacidade
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
