"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Loader2, MessageCircle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  convertLeadAction,
  deleteEntryAction,
  excludeEntryAction,
  grantExtraAction,
  linkLeadAction,
  pickForEntryAction,
  removeNumberAction,
  setRuleCheckAction,
  waiveRuleAction,
} from "@/actions/raffles";
import { CustomerPicker } from "@/components/customer-picker";
import { NumberPicker } from "@/components/sorteio/number-picker";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatTime, initials } from "@/lib/format";
import {
  deriveStatus,
  formatPhone,
  matchCustomer,
  missingRules,
  padNumber,
  type Raffle,
  type RaffleEntry,
} from "@/lib/raffles";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { ExtraNumberDialog, WaiveRuleDialog } from "./exception-dialogs";
import { avatarColors } from "./ui";

interface Props {
  storeId: string;
  origin: string;
  raffle: Raffle;
  entry: RaffleEntry | null;
  entries: RaffleEntry[];
  customers: Customer[];
  userName: string;
  onClose: () => void;
}

export function ParticipantSheet({ entry, onClose, ...rest }: Props) {
  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-[440px]" showCloseButton={false}>
        <SheetTitle className="sr-only">{entry?.name ?? "Participante"}</SheetTitle>
        {entry && <Ficha key={entry.id} entry={entry} onClose={onClose} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}

/** A number's date, tolerating a missing/invalid one instead of crashing the ficha. */
const dateOrEmpty = (iso: string) => (Number.isNaN(Date.parse(iso)) ? "" : formatDate(iso));

const H3 = "mb-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft";

function Ficha({
  storeId,
  origin,
  raffle,
  entry,
  entries,
  customers,
  userName,
  onClose,
}: Props & { entry: RaffleEntry }) {
  const [view, setView] = useState<"ficha" | "escolher">("ficha");
  const [extraOpen, setExtraOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const excluded = entry.status === "excl";
  const missing = missingRules(raffle.rules, entry);
  const colors = avatarColors(entry.name);
  const link = `${origin}/s/${raffle.slug}?t=${entry.token}`;
  const waText = `Oi, ${entry.name.split(" ")[0]}! Escolha seu número do sorteio "${raffle.name}": ${link}`;
  const waHref = `https://wa.me/55${entry.phone}?text=${encodeURIComponent(waText)}`;
  const linked = entry.customerId ? customers.find((c) => c.id === entry.customerId) : null;
  const match = linked ? null : matchCustomer(customers, entry.phone);
  const takenByAll = entries.flatMap((e) => e.numbers.map((n) => n.n));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Algo deu errado.");
      if (okMsg) toast.success(okMsg);
      after?.();
    });
  }

  if (view === "escolher") {
    const count = Math.max(1, entry.slots.length);
    return (
      <NumberPicker
        mode="admin"
        from={raffle.numberFrom}
        to={raffle.numberTo}
        taken={takenByAll}
        own={entry.numbers.map((n) => n.n)}
        quantos={count}
        conflict={conflict}
        pending={pending}
        title={`Escolher número para ${entry.name}`}
        onClose={() => setView("ficha")}
        ctaLabel={(p) =>
          p.length === 1
            ? `Dar o nº ${padNumber(p[0])} para ${entry.name.split(" ")[0]}`
            : `Dar ${p.length} números para ${entry.name.split(" ")[0]}`
        }
        onConfirm={(picks) =>
          startTransition(async () => {
            const res = await pickForEntryAction(storeId, entry.id, picks);
            if (res.ok) {
              setConflict(null);
              toast.success("Número registrado.");
              return setView("ficha");
            }
            setConflict(res.taken ?? null);
            toast.error(res.error ?? "Não foi possível registrar.");
          })
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-[13px] border-b border-[#EEF3EA] px-[22px] py-5">
        <span
          className="flex size-[46px] shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={colors}
        >
          {initials(entry.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{entry.name}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
            {entry.customerId ? "Cliente" : "Lead"} · {raffle.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex size-9 items-center justify-center rounded-[9px] border border-border text-ink-soft"
        >
          <X className="size-[15px]" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5 [&>*]:shrink-0">
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[#EEF3EA] bg-[#F0F4ED]">
          <div className="flex items-center gap-[11px] bg-white px-3.5 py-[11px]">
            <MessageCircle className="size-4 text-[#2E7D4A]" />
            <span className="flex-1 text-xs text-ink-soft">WhatsApp</span>
            <a
              href={`https://wa.me/55${entry.phone}`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-semibold"
            >
              {formatPhone(entry.phone)}
            </a>
          </div>
          {entry.instagram && (
            <div className="flex items-center gap-[11px] bg-white px-3.5 py-[11px]">
              <InstagramIcon className="size-4 text-[#C2407E]" />
              <span className="flex-1 text-xs text-ink-soft">Instagram</span>
              <a
                href={`https://instagram.com/${entry.instagram}`}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-semibold text-[#C2407E]"
              >
                @{entry.instagram}
              </a>
            </div>
          )}
          <div className="flex items-center gap-[11px] bg-white px-3.5 py-[11px]">
            <Clock className="size-4 text-ink-soft" />
            <span className="flex-1 text-xs text-ink-soft">Cadastro</span>
            <span className="text-[13px] font-semibold">
              {formatDate(entry.createdAt)} · {formatTime(entry.createdAt)} pelo link
            </span>
          </div>
        </div>

        <section>
          <h3 className={H3}>Números da sorte</h3>
          <div className="flex flex-col gap-2">
            {entry.numbers.map((n) => {
              const extra = n.kind === "extra";
              const bonus = n.kind === "bonus";
              const rule = raffle.rules.find((r) => r.id === n.ruleId);
              return (
                <div
                  key={n.n}
                  className={cn(
                    "flex items-center gap-3 rounded-[11px] border px-3 py-2.5",
                    extra || bonus ? "border-[#F0E4C8] bg-[#FBF6EC]" : "border-[#EEF3EA]",
                  )}
                >
                  <span
                    className={cn(
                      "tabular flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
                      extra || bonus
                        ? "border-[1.5px] border-[#E7CF8E] bg-white text-[#8A6312]"
                        : "bg-primary text-white",
                    )}
                  >
                    {n.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                      {extra
                        ? `Exceção: ${n.reason ?? "número extra"}`
                        : bonus
                          ? `Bônus: ${rule?.text ?? "regra de bônus"}`
                          : "Escolhido no link"}
                    </span>
                    <span className="block text-[11.5px] text-ink-soft">
                      {extra
                        ? `Liberado${n.by ? ` por ${n.by}` : ""}${dateOrEmpty(n.at) ? ` · ${dateOrEmpty(n.at)}` : ""}`
                        : bonus
                          ? "Escolhido depois de conferido"
                          : "Número do cadastro"}
                    </span>
                  </span>
                  {(extra || bonus) && !excluded && (
                    <button
                      type="button"
                      aria-label={`Remover número ${n.n}`}
                      disabled={pending}
                      onClick={() => run(() => removeNumberAction(storeId, entry.id, n.n), "Número removido.")}
                      className="flex size-[34px] items-center justify-center rounded-[9px] text-ink-soft hover:bg-wash"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {entry.slots.map((s, i) => {
              const rule = raffle.rules.find((r) => r.id === s.ruleId);
              return (
                <div
                  key={`slot-${i}`}
                  className="flex items-center gap-3 rounded-[11px] border-[1.5px] border-dashed border-[#D9B868] px-3 py-2.5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#D9B868] text-sm font-bold text-[#8A6312]">
                    +1
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                      {s.kind === "extra" ? `Exceção: ${s.reason ?? "número extra"}` : `Bônus: ${rule?.text ?? "regra de bônus"}`}
                    </span>
                    <span className="block text-[11.5px] text-ink-soft">
                      Aguardando {entry.name.split(" ")[0]} escolher
                    </span>
                  </span>
                </div>
              );
            })}
            {entry.numbers.length === 0 && entry.slots.length === 0 && (
              <p className="text-[12.5px] text-ink-soft">
                {excluded ? "Números liberados ao excluir do sorteio." : "Nenhum número ainda."}
              </p>
            )}
            <div className="flex gap-2">
              <a
                href={entry.slots.length ? waHref : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!entry.slots.length}
                className={cn(
                  "flex h-10 flex-1 items-center justify-center gap-[7px] rounded-[10px] bg-primary text-[12.5px] font-semibold text-white",
                  !entry.slots.length && "pointer-events-none opacity-50",
                )}
              >
                <MessageCircle className="size-3.5" />
                Enviar link p/ escolher
              </a>
              <button
                type="button"
                disabled={!entry.slots.length || excluded}
                onClick={() => setView("escolher")}
                className="h-10 flex-1 rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-ink disabled:opacity-50"
              >
                Escolher por ele
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className={H3}>Regras conferidas</h3>
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[#EEF3EA] bg-[#F0F4ED]">
            {raffle.rules.map((r) => {
              const waived = entry.waived[r.id];
              const bonus = r.type === "bonus";
              return (
                <label key={r.id} className="flex items-center gap-[11px] bg-white px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={!!entry.checks[r.id] || !!waived}
                    disabled={pending || excluded || !!waived}
                    onChange={(e) => run(() => setRuleCheckAction(storeId, entry.id, r.id, e.target.checked))}
                    className={cn("size-[18px]", bonus ? "accent-[#8A6312]" : "accent-[#186B41]")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]">{r.text}</span>
                    {waived && (
                      <span className="block text-[11px] text-ink-soft">
                        Dispensada por {waived.by}: {waived.reason}
                      </span>
                    )}
                  </span>
                  <span className={cn("text-[11px]", bonus ? "font-bold text-[#8A6312]" : "text-ink-soft")}>
                    {bonus ? "Bônus +1" : "Obrigatória"}
                  </span>
                </label>
              );
            })}
            {raffle.rules.length === 0 && (
              <p className="bg-white px-3.5 py-3 text-[12.5px] text-ink-soft">Este sorteio não tem regras.</p>
            )}
          </div>
          <div
            className={cn(
              "mt-2.5 flex items-center gap-2 rounded-[11px] border px-3 py-2.5 text-[12.5px]",
              excluded
                ? "border-border bg-[#F1F4F0] text-ink-soft"
                : deriveStatus(raffle.rules, entry) === "ok"
                  ? "border-[#DCEAD4] bg-[#F2F8EF] text-[#37543F]"
                  : "border-[#F0E4C8] bg-[#FBF1DC] text-[#8A5A0F]",
            )}
          >
            <span className="size-[7px] shrink-0 rounded-full bg-current" />
            {excluded
              ? `Excluído${entry.exclReason ? `: ${entry.exclReason}` : ""}`
              : missing.length === 0
                ? "Validado: todas as obrigatórias conferidas"
                : `Falta conferir: ${missing.map((m) => m.text).join(" · ")}`}
          </div>
        </section>

        {!excluded && (
          <section>
            <h3 className={H3}>Exceções</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setExtraOpen(true)}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#CFDACB] bg-white text-[12.5px] font-semibold text-[#3D4A42]"
              >
                <Plus className="size-[13px]" />
                Número extra
              </button>
              <button
                type="button"
                disabled={missing.length === 0}
                onClick={() => setWaiveOpen(true)}
                className="flex h-10 flex-1 items-center justify-center rounded-[10px] border border-dashed border-[#CFDACB] bg-white text-[12.5px] font-semibold text-[#3D4A42] disabled:opacity-50"
              >
                Dispensar uma regra
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-soft">
              Cada exceção pede um motivo e fica registrada com quem liberou.
            </p>
          </section>
        )}

        <section>
          <h3 className={H3}>Cliente</h3>
          {linked ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#DCEAD4] bg-[#F2F8EF] px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{linked.name}</span>
                <span className="block text-[11.5px] text-ink-soft">
                  {linked.orderCount} {linked.orderCount === 1 ? "pedido" : "pedidos"}
                </span>
              </span>
              <Link
                href={`/painel/${storeId}/clientes`}
                className="flex h-[34px] items-center rounded-[9px] border border-border bg-white px-3 text-xs font-semibold"
              >
                Abrir cliente
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[#D3E2EE] bg-[#EAF1F7] px-3.5 py-[13px]">
                <p className="text-[12.5px] leading-snug text-[#2B4A63]">
                  {match ? "Ainda não é cliente. Achamos um cadastro parecido:" : "Ainda não é cliente."}
                </p>
                {match && (
                  <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] bg-white px-[11px] py-[9px]">
                    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-mist text-[11.5px] font-bold text-primary">
                      {initials(match.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{match.name}</span>
                      <span className="block text-[11.5px] text-ink-soft">
                        Mesmo WhatsApp · {match.orderCount} {match.orderCount === 1 ? "pedido" : "pedidos"}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => linkLeadAction(storeId, entry.phone, match.id), "Vinculado ao cliente.")}
                      className="h-[34px] rounded-[9px] bg-[#2B5F86] px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Vincular
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <CustomerPicker
                  storeId={storeId}
                  customers={customers}
                  value=""
                  onChange={(id) => run(() => linkLeadAction(storeId, entry.phone, id), "Vinculado ao cliente.")}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => convertLeadAction(storeId, entry.phone), "Cadastrado como cliente.")
                  }
                  className="h-10 rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-ink disabled:opacity-60"
                >
                  Cadastrar como cliente
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="flex shrink-0 items-center gap-4 border-t border-[#EEF3EA] px-[22px] py-3.5">
        {!excluded && (
          <button
            type="button"
            onClick={() => setExcludeOpen(true)}
            className="h-10 px-1 text-[12.5px] font-semibold text-[#B23A22]"
          >
            Excluir do sorteio
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="flex h-10 items-center gap-1.5 px-1 text-[12.5px] font-semibold text-[#B23A22]"
        >
          <Trash2 className="size-3.5" />
          Apagar cadastro
        </button>
      </div>

      <ExtraNumberDialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        entry={entry}
        by={userName}
        pending={pending}
        onConfirm={({ count, reason: why, chooser }) =>
          run(
            () => grantExtraAction(storeId, entry.id, count, why),
            "Número extra liberado.",
            () => {
              setExtraOpen(false);
              if (chooser === "loja") setView("escolher");
              else window.open(waHref, "_blank", "noopener");
            },
          )
        }
      />
      <WaiveRuleDialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        entry={entry}
        raffle={raffle}
        by={userName}
        pending={pending}
        onConfirm={({ ruleId, reason: why }) =>
          run(() => waiveRuleAction(storeId, entry.id, ruleId, why), "Regra dispensada.", () => setWaiveOpen(false))
        }
      />
      <ConfirmDialog
        open={excludeOpen}
        onOpenChange={setExcludeOpen}
        title={`Excluir ${entry.name} do sorteio?`}
        text={`${entry.numbers.length ? `${entry.numbers.length === 1 ? `O nº ${entry.numbers[0].n} volta` : "Os números voltam"} a ficar livre${entry.numbers.length === 1 ? "" : "s"} e ` : ""}ele(a) não concorre mais. O cadastro continua em Leads.`}
        cta="Excluir do sorteio"
        tone="danger"
        pending={pending}
        onConfirm={() =>
          run(
            () => excludeEntryAction(storeId, entry.id, reason),
            "Participante excluído.",
            () => (setExcludeOpen(false), setReason("")),
          )
        }
      >
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="excl-motivo" className="text-xs font-semibold text-[#3D4A42]">
            Motivo (fica registrado)
          </label>
          <Input
            id="excl-motivo"
            value={reason}
            placeholder="Ex.: perfil duplicado"
            onChange={(e) => setReason(e.target.value)}
            className="h-[42px] rounded-[10px] border-[#DDE6DA] bg-white px-3 text-sm"
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Apagar o cadastro de ${entry.name}?`}
        text="O cadastro some deste sorteio e não dá para desfazer. Os números voltam a ficar livres; o lead continua em Leads."
        cta="Apagar cadastro"
        tone="danger"
        pending={pending}
        onConfirm={() =>
          run(() => deleteEntryAction(storeId, entry.id), "Cadastro apagado.", () => (setDeleteOpen(false), onClose()))
        }
      />
      {pending && view === "ficha" && (
        <Loader2 className="pointer-events-none absolute right-16 top-7 size-4 animate-spin text-ink-faint" />
      )}
    </div>
  );
}
