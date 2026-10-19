"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Download, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { convertLeadAction, linkLeadAction } from "@/actions/raffles";
import { CustomerPicker } from "@/components/customer-picker";
import { usePageHeader } from "@/components/shell/app-shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateShort, formatRelative, initials } from "@/lib/format";
import { formatPhone, type LeadKind } from "@/lib/raffles";
import type { LeadView } from "@/data/raffles";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LEAD_STATUS, Pill, SorteiosTabs, avatarColors } from "../ui";

type Filter = "todos" | LeadKind;

interface Props {
  storeId: string;
  leads: LeadView[];
  customers: Customer[];
  raffleCount: number;
  novos: number;
  raffleFilter: string | null;
  raffleFilterName: string | null;
}

const ROW_COLS = "minmax(0,1fr) 210px 110px 200px 190px";
const BTN =
  "flex h-11 items-center rounded-[9px] border border-border bg-white px-[11px] text-xs font-semibold text-ink min-[820px]:h-[34px] disabled:opacity-60";

function csvCell(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function LeadsClient({ storeId, leads, customers, raffleCount, novos, raffleFilter, raffleFilterName }: Props) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  usePageHeader({
    title: "Leads/Sorteios",
    subtitle: "Um lead por WhatsApp, mesmo que participe de vários sorteios",
  });

  const scoped = useMemo(
    () => (raffleFilter ? leads.filter((l) => l.raffleIds.includes(raffleFilter)) : leads),
    [leads, raffleFilter],
  );
  const counts = useMemo(
    () => ({
      todos: scoped.length,
      novo: scoped.filter((l) => l.kind === "novo").length,
      vinc: scoped.filter((l) => l.kind === "vinc").length,
      cli: scoped.filter((l) => l.kind === "cli").length,
    }),
    [scoped],
  );
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const rows = scoped.filter(
    (l) =>
      (filter === "todos" || l.kind === filter) &&
      (!q ||
        l.name.toLowerCase().includes(q) ||
        l.instagram.toLowerCase().includes(q.replace(/^@/, "")) ||
        (qDigits.length > 2 && l.phone.includes(qDigits))),
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Algo deu errado.");
      toast.success(okMsg);
    });
  }

  function exportCsv() {
    const head = ["Nome", "WhatsApp", "Instagram", "E-mail", "Sorteios", "Último cadastro", "Situação"];
    const lines = rows.map((l) =>
      [
        l.name,
        formatPhone(l.phone),
        l.instagram ? `@${l.instagram}` : "",
        l.email ?? "",
        l.raffleNames.join(" | "),
        formatDateShort(l.lastAt),
        LEAD_STATUS[l.kind].label,
      ]
        .map(csvCell)
        .join(";"),
    );
    // BOM so Excel opens accents correctly.
    const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leads-sorteios.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const chips: [Filter, string][] = [
    ["todos", `Todos · ${counts.todos}`],
    ["novo", `Novos · ${counts.novo}`],
    ["vinc", `Vinculados · ${counts.vinc}`],
    ["cli", `Viraram cliente · ${counts.cli}`],
  ];

  function actions(l: LeadView) {
    if (l.kind !== "novo") {
      return (
        <Link href={`/painel/${storeId}/clientes`} className={BTN}>
          Abrir cliente
        </Link>
      );
    }
    return (
      <>
        {l.match ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => linkLeadAction(storeId, l.id, l.match!.id), "Lead vinculado ao cliente.")}
            className={cn(BTN, "border-[#2B5F86] bg-[#2B5F86] text-white")}
          >
            Vincular a {l.match.name}
          </button>
        ) : (
          <LinkPicker storeId={storeId} customers={customers} onPick={(id) => run(() => linkLeadAction(storeId, l.id, id), "Lead vinculado ao cliente.")} />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => convertLeadAction(storeId, l.id), "Lead cadastrado como cliente.")}
          className={BTN}
        >
          Virar cliente
        </button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SorteiosTabs storeId={storeId} active="leads" sorteios={raffleCount} novos={novos} />
        <label className="flex h-10 w-full items-center gap-2 rounded-[10px] border border-border bg-white px-[13px] min-[560px]:w-[250px]">
          <Search className="size-[15px] shrink-0 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, @ ou WhatsApp…"
            aria-label="Buscar lead"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <span className="hidden flex-1 min-[820px]:block" />
        <div role="group" aria-label="Situação" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1">
          {chips.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "h-[34px] shrink-0 whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-semibold",
                filter === k ? "border-primary bg-primary text-white" : "border-border bg-white text-[#3D4A42]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex h-10 items-center gap-[7px] rounded-[10px] border border-border bg-white px-3.5 text-[13px] font-semibold disabled:opacity-50"
        >
          <Download className="size-3.5" />
          Exportar contatos
        </button>
      </div>

      {raffleFilter && (
        <div className="flex w-fit items-center gap-2 rounded-full bg-[#E7F4EC] py-1 pl-3 pr-1 text-xs font-semibold text-[#2E7D4A]">
          Só quem participou de {raffleFilterName}
          <Link
            href={`/painel/${storeId}/sorteios/leads`}
            aria-label="Limpar filtro do sorteio"
            className="flex size-6 items-center justify-center rounded-full hover:bg-white/60"
          >
            <X className="size-3.5" />
          </Link>
        </div>
      )}

      {leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum lead ainda"
          description="Os leads aparecem aqui quando alguém se cadastra no link de um sorteio publicado."
          action={
            <Link href={`/painel/${storeId}/sorteios`} className="flex h-11 items-center rounded-xl bg-primary px-5 text-[13.5px] font-semibold text-white">
              Ver sorteios
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-paper px-6 py-12 text-center text-[13px] text-ink-soft">
          Nenhum lead encontrado com esses filtros.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[14px] border border-border bg-white min-[820px]:block">
            <div
              className="grid gap-3 border-b border-border bg-paper px-5 py-3 text-[10.5px] font-bold uppercase tracking-[.4px] text-ink-soft"
              style={{ gridTemplateColumns: ROW_COLS }}
            >
              <span>Lead</span>
              <span>Sorteios</span>
              <span>Cadastro</span>
              <span>Situação</span>
              <span className="text-right">Ação</span>
            </div>
            {rows.map((l) => (
              <div
                key={l.id}
                className="grid items-center gap-3 border-b border-[#F0F4ED] px-5 py-3"
                style={{ gridTemplateColumns: ROW_COLS }}
              >
                <Person lead={l} />
                <span className="text-[12.5px] leading-snug text-[#3D4A42]">{sorteiosText(l)}</span>
                <span className="text-[12.5px] text-ink-soft">{formatRelative(l.lastAt)}</span>
                <Situation lead={l} />
                <span className="flex justify-end gap-1.5">{actions(l)}</span>
              </div>
            ))}
            <div className="px-5 py-3 text-xs text-ink-soft">Mostrando {rows.length} · mais recentes primeiro</div>
          </div>

          <ul className="flex flex-col gap-3 min-[820px]:hidden">
            {rows.map((l) => (
              <li key={l.id} className="rounded-2xl border border-border bg-white p-3.5">
                <div className="flex items-start gap-3">
                  <Person lead={l} />
                  <Situation lead={l} compact />
                </div>
                <p className="mt-2 text-[12px] text-ink-soft">
                  {formatRelative(l.lastAt)} · {sorteiosText(l)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">{actions(l)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function sorteiosText(l: LeadView): string {
  return l.raffleNames.map((n, i) => (l.wonRaffleIds.includes(l.raffleIds[i]) ? `${n} · ganhador(a)` : n)).join(" · ");
}

function Person({ lead: l }: { lead: LeadView }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-[11px]">
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold"
        style={avatarColors(l.name)}
      >
        {initials(l.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold">{l.name}</span>
        <span className="block truncate text-[11.5px] text-ink-soft">
          {formatPhone(l.phone)}
          {l.instagram && ` · @${l.instagram}`}
        </span>
      </span>
    </span>
  );
}

function Situation({ lead: l, compact = false }: { lead: LeadView; compact?: boolean }) {
  const s = LEAD_STATUS[l.kind];
  const note =
    l.kind === "novo" && l.match
      ? `Parece com o cliente ${l.match.name}`
      : l.kind !== "novo" && l.match
        ? l.kind === "cli"
          ? `Virou cliente · ${l.match.orderCount} ${l.match.orderCount === 1 ? "pedido" : "pedidos"}`
          : `Cliente desde ${formatDateShort(l.match.since)}`
        : "";
  return (
    <span className="flex shrink-0 flex-col items-start gap-[3px]">
      <Pill tone={s.tone}>{s.label}</Pill>
      {note && !compact && <span className="text-[11.5px] text-ink-soft">{note}</span>}
    </span>
  );
}

function LinkPicker({
  storeId,
  customers,
  onPick,
}: {
  storeId: string;
  customers: Customer[];
  onPick: (customerId: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger className={BTN}>Vincular a cliente</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <CustomerPicker storeId={storeId} customers={customers} value="" onChange={onPick} />
      </PopoverContent>
    </Popover>
  );
}
