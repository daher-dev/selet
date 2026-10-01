"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateStoreProfileAction } from "@/actions/settings";
import { usePageHeader } from "@/components/shell/app-shell-context";
import { Button } from "@/components/ui/button";
import type { Store } from "@/lib/types";
import { maskPhone } from "../../clientes/customer-logic";

const LABEL = "mb-1.5 block text-[11px] font-bold uppercase tracking-[.6px] text-ink-faint";
const FIELD =
  "h-[46px] w-full rounded-xl border border-[#E7EEE6] bg-[#FAFCF8] px-4 text-[14px] font-medium text-ink outline-none transition-shadow placeholder:font-normal placeholder:text-[#A0AC9D] focus:border-[#7FB093] focus:shadow-[0_0_0_3px_#DDEBD5]";

/** Configurações → Loja: the store profile (design: Mock Configurações 1b). */
export function LojaClient({ store }: { store: Store }) {
  usePageHeader({ title: "Configurações", subtitle: "Dados e preferências da loja" });
  const initial = {
    name: store.name,
    address: store.address ?? "",
    whatsapp: store.whatsapp ?? "",
    email: store.email ?? "",
  };
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k]);

  function save() {
    startTransition(async () => {
      const r = await updateStoreProfileAction({ storeId: store.id, ...form });
      if (r.ok) toast.success("Dados da loja atualizados.");
      else toast.error(r.error ?? "Algo deu errado.");
    });
  }

  return (
    <div className="max-w-[1000px]">
      <section className="rounded-2xl border border-[#E7EEE6] bg-white p-[22px]">
        <h2 className="text-[17px] font-bold text-ink">Dados da loja</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">Aparecem no cardápio e nos comprovantes.</p>

        <div className="mt-5 flex flex-col gap-5 min-[640px]:flex-row">
          <div
            className="flex size-24 shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-[#CDDCC4] text-center font-mono text-[10.5px] leading-snug text-[#A0AC9D]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #F3F8EF 0 8px, #EDF3E9 8px 16px)",
            }}
            title="Envio de logo em breve"
          >
            <span>logo</span>
            <span>da loja</span>
            <span className="mt-1 rounded-full bg-white/80 px-1.5 py-px font-sans text-[9px] font-semibold uppercase tracking-wide text-ink-faint">
              em breve
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <label className={LABEL} htmlFor="store-name">Nome da loja</label>
              <input
                id="store-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={60}
                className={`${FIELD} font-bold`}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="store-address">Endereço</label>
              <input
                id="store-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={160}
                className={FIELD}
              />
            </div>
            <div className="grid gap-4 min-[640px]:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="store-whatsapp">WhatsApp</label>
                <input
                  id="store-whatsapp"
                  inputMode="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="store-email">E-mail</label>
                <input
                  id="store-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="loja@exemplo.com.br"
                  maxLength={120}
                  className={FIELD}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-[18px] flex justify-end gap-2.5">
        <Button
          type="button"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => setForm(initial)}
          className="h-11 rounded-xl border-[#E7EEE6] bg-white px-[18px] text-[13.5px] font-semibold text-ink-soft"
        >
          Descartar
        </Button>
        <Button
          type="button"
          disabled={pending || !dirty || !form.name.trim()}
          onClick={save}
          className="h-11 rounded-xl px-[22px] text-[13.5px] font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
