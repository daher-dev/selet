"use client";

import { LogOut, Store } from "lucide-react";
import { SeletMark } from "@/components/shell/selet-mark";

/**
 * Friendly landing for an authorized user who has no store assigned yet.
 * Replaces the old `/` ⇄ `/login` redirect loop with a real destination.
 */
export function NoStoreScreen({ name }: { name: string }) {
  const firstName = name.trim().split(/\s+/)[0] || name;

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-paper px-6 py-10">
      <div className="w-full max-w-[420px] text-center">
        <SeletMark className="mx-auto size-[52px] rounded-[14px]" />

        <h1 className="mt-6 font-display text-[30px] font-semibold leading-[1.15] text-ink">
          Olá, {firstName}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Sua conta está ativa, mas ainda não está vinculada a nenhuma loja.
        </p>

        <div className="mt-7 flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-mint-wash text-primary">
            <Store className="size-[17px]" strokeWidth={1.8} />
          </span>
          <p className="text-[12.5px] leading-normal text-ink-soft">
            Peça a um administrador para adicionar você a uma loja. Assim que
            isso for feito, o painel aparecerá aqui automaticamente.
          </p>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-input bg-white px-5 py-3 text-[14px] font-semibold text-ink transition-all duration-150 hover:-translate-y-px hover:border-primary hover:shadow-[0_10px_24px_-14px_rgba(24,107,65,.5)] active:translate-y-0"
        >
          <LogOut className="size-4" strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </div>
  );
}
