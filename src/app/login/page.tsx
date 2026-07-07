import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";
import { LoginPanel } from "./login-panel";
import { SeletLeaf } from "@/components/shell/selet-mark";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1C7A4A] via-primary to-deep px-6 py-7 lg:flex lg:flex-1 lg:flex-col lg:justify-between lg:px-14 lg:py-13">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0, rgba(255,255,255,.04) 1px, transparent 1px, transparent 11px)",
          }}
        />
        <div className="pointer-events-none absolute -top-16 -right-10 size-[340px] rounded-full bg-leaf/16" />
        <div className="pointer-events-none absolute -bottom-24 -left-18 hidden size-[300px] rounded-full bg-leaf/10 lg:block" />

        <div className="relative flex items-baseline gap-3">
          <span className="font-display text-[32px] font-semibold leading-none tracking-[0.01em] text-white lg:text-[40px]">
            Selet
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[2.5px] text-leaf">
            Vida ativa &amp; saudável
          </span>
        </div>

        <div className="relative hidden max-w-[440px] lg:block">
          <p className="text-[14px] leading-[1.6] text-white/72">
            Pedidos, clientes, estoque e finanças da sua loja em um só lugar.
            Entre para continuar.
          </p>
        </div>

        <div className="relative hidden gap-6 text-[12px] text-white/60 lg:flex">
          <span>Mais energia</span>
          <span className="text-white/30">•</span>
          <span>Progresso diário</span>
          <span className="text-white/30">•</span>
          <span>Hábitos que ficam</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-start justify-center bg-paper px-6 py-9 lg:w-[min(46%,560px)] lg:flex-none lg:items-center lg:px-10">
        <div className="w-full max-w-[352px]">
          <span className="mb-6 flex size-[52px] items-center justify-center rounded-[14px] bg-primary text-white shadow-[0_12px_26px_-12px_rgba(24,107,65,.6)]">
            <SeletLeaf className="size-[26px]" />
          </span>

          <h1 className="font-display text-[34px] font-semibold leading-[1.1] text-ink">
            Bem-vindo de volta
          </h1>
          <p className="mt-2 mb-8 text-[14px] leading-relaxed text-ink-soft">
            Acesse o painel da Selet com sua conta Google.
          </p>

          <LoginPanel />

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-[1px] text-ink-faint">
              Acesso exclusivo
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

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
        </div>
      </div>
    </div>
  );
}
