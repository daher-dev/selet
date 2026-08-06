import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1C7A4A] via-primary to-deep pt-[34px] px-[26px] pb-[30px] lg:flex lg:flex-1 lg:flex-col lg:justify-between lg:px-14 lg:py-13">
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0, rgba(255,255,255,.04) 1px, transparent 1px, transparent 11px)",
          }}
        />
        <div className="selet-leaf pointer-events-none absolute -top-10 -right-[30px] size-[200px] rounded-full bg-leaf/16 lg:-top-16 lg:-right-10 lg:size-[340px]" />
        <div
          className="selet-leaf pointer-events-none absolute -bottom-24 -left-18 hidden size-[300px] rounded-full bg-leaf/10 lg:block"
          style={{ animationDelay: "-3s" }}
        />

        <div className="relative flex items-baseline gap-3">
          <span className="font-display text-[34px] font-semibold leading-none tracking-[0.01em] text-white lg:text-[40px]">
            Selet
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[2.5px] text-leaf">
            <span className="lg:hidden">Painel</span>
            <span className="hidden lg:inline">Vida ativa &amp; saudável</span>
          </span>
        </div>

        <div className="relative hidden max-w-[440px] lg:block">
          <p className="text-[14px] leading-[1.6] text-white/72">
            Acompanhe pedidos, estoque e clientes das suas lojas em um só
            lugar. Entre para continuar.
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
        <div className="selet-rise w-full max-w-[352px]">
          <LoginPanel />
        </div>
      </div>
    </div>
  );
}
