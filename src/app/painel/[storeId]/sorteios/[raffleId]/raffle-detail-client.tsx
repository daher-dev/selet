"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Link2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { setRuleCheckAction, setSignupsOpenAction } from "@/actions/raffles";
import { usePageAction, usePageHeader } from "@/components/shell/app-shell-context";
import { formatDate, initials } from "@/lib/format";
import {
  formatDayMonth,
  formatHour,
  missingRules,
  padNumber,
  totalNumbers,
  type Raffle,
  type RaffleEntry,
  type RaffleRule,
} from "@/lib/raffles";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../confirm-dialog";
import { DrawSheet } from "../draw-sheet";
import { ParticipantSheet } from "../participant-sheet";
import { RaffleFormSheet } from "../raffle-form-sheet";
import { ENTRY_STATUS, Pill, RAFFLE_STATUS, avatarColors, copyLink, linkLabel } from "../ui";

type Filter = "todos" | "pend" | "ok" | "excl";

interface Props {
  storeId: string;
  raffle: Raffle;
  entries: RaffleEntry[];
  customers: Customer[];
  origin: string;
  userName: string;
}

const OUTLINE_BTN =
  "flex h-10 items-center justify-center gap-[7px] rounded-[10px] border border-border bg-white px-3.5 text-[13px] font-semibold text-ink";

/** Obligatory rules first, bonus last (the bonus column is the gold one). */
function orderedRules(rules: RaffleRule[]): RaffleRule[] {
  return [...rules.filter((r) => r.type === "obr"), ...rules.filter((r) => r.type === "bonus")];
}

function rowNote(raffle: Raffle, e: RaffleEntry): string {
  if (e.status === "excl") return e.exclReason ?? "";
  if (e.slots.length) return `+${e.slots.length} número${e.slots.length > 1 ? "s" : ""} aguardando escolha`;
  if (e.numbers.some((n) => n.kind === "extra")) return "Exceção: +1 número";
  const miss = missingRules(raffle.rules, e).length;
  return miss ? `Falta ${miss} ${miss > 1 ? "regras" : "regra"}` : "";
}

export function RaffleDetailClient({ storeId, raffle, entries, customers, origin, userName }: Props) {
  const [tab, setTab] = useState<"part" | "num">("part");
  const [filter, setFilter] = useState<Filter>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [confirm, setConfirm] = useState<"encerrar" | null>(null);
  const [pending, startTransition] = useTransition();

  const st = RAFFLE_STATUS[raffle.status];
  usePageHeader({ title: raffle.name, subtitle: `Sorteios · ${st.label}` });
  usePageAction(null);

  const rules = useMemo(() => orderedRules(raffle.rules), [raffle.rules]);
  const counts = useMemo(
    () => ({
      todos: entries.length,
      pend: entries.filter((e) => e.status === "pend").length,
      ok: entries.filter((e) => e.status === "ok").length,
      excl: entries.filter((e) => e.status === "excl").length,
    }),
    [entries],
  );
  const view = entries.filter((e) => filter === "todos" || e.status === filter);
  const taken = entries.reduce((n, e) => n + e.numbers.length, 0);
  const total = totalNumbers(raffle);
  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const canDraw = raffle.status === "aberto" || raffle.status === "encerrado";

  const gridCols = `minmax(0,1fr) 150px ${rules.map((r) => (r.type === "bonus" ? "108px" : "84px")).join(" ")} 150px`;

  function toggle(e: RaffleEntry, r: RaffleRule) {
    startTransition(async () => {
      const res = await setRuleCheckAction(storeId, e.id, r.id, !e.checks[r.id]);
      if (!res.ok) toast.error(res.error ?? "Não foi possível salvar.");
    });
  }

  function closeSignups() {
    startTransition(async () => {
      const res = await setSignupsOpenAction(storeId, raffle.id, false);
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Inscrições encerradas.");
    });
  }

  function reopenSignups() {
    startTransition(async () => {
      const res = await setSignupsOpenAction(storeId, raffle.id, true);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Inscrições reabertas.");
    });
  }

  const chips: [Filter, string][] = [
    ["todos", `Todos · ${counts.todos}`],
    ["pend", `A conferir · ${counts.pend}`],
    ["ok", `Validados · ${counts.ok}`],
    ["excl", `Excluídos · ${counts.excl}`],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          href={`/painel/${storeId}/sorteios`}
          className="flex h-10 items-center gap-1 pr-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Sorteios
        </Link>
        <Pill tone={st.tone} dot={st.dot}>
          {st.label}
        </Pill>
        <span className="flex-1" />
        {raffle.status !== "rascunho" && (
          <div className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-paper pl-3 pr-1.5">
            <Link2 className="size-3.5 shrink-0 text-ink-soft" />
            <span className="max-w-[260px] truncate text-[12.5px] font-semibold">{linkLabel(origin, raffle.slug)}</span>
            <button
              type="button"
              onClick={() => copyLink(origin, raffle.slug)}
              className="h-[30px] rounded-lg border border-border bg-white px-2.5 text-xs font-semibold"
            >
              Copiar
            </button>
          </div>
        )}
        {raffle.status !== "sorteado" && (
          <button type="button" onClick={() => setEditOpen(true)} className={OUTLINE_BTN}>
            <Pencil className="size-3.5" />
            Editar
          </button>
        )}
        {raffle.status === "aberto" && (
          <button type="button" onClick={() => setConfirm("encerrar")} className={OUTLINE_BTN}>
            Encerrar inscrições
          </button>
        )}
        {raffle.status === "encerrado" && (
          <button type="button" onClick={reopenSignups} disabled={pending} className={OUTLINE_BTN}>
            Reabrir inscrições
          </button>
        )}
        {canDraw && (
          <button
            type="button"
            onClick={() => setDrawOpen(true)}
            className="flex h-10 items-center rounded-[10px] bg-primary px-3.5 text-[13px] font-bold text-white"
          >
            Realizar sorteio
          </button>
        )}
      </div>

      {raffle.winner && (
        <div className="flex items-center gap-3 rounded-xl border border-[#F0E4C8] bg-[#FBF6EC] px-3.5 py-3">
          <span className="tabular flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-[17px] font-bold text-white">
            {raffle.winner.number}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-bold uppercase tracking-[.5px] text-[#8A6312]">Ganhador(a)</span>
            <span className="block truncate text-sm font-semibold">{raffle.winner.name}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 min-[820px]:grid-cols-4">
        <Stat label="Participantes" value={String(counts.todos)} />
        <Stat label="Validados" value={String(counts.ok)} valueClass="text-[#2E7D4A]" />
        <Stat
          label="Números escolhidos"
          value={String(taken)}
          note={`de ${total} · ${raffle.perPerson} por pessoa`}
        />
        <Stat
          label="Sorteio"
          value={formatDayMonth(raffle.drawAt)}
          note={`${formatHour(raffle.drawAt)}${raffle.location ? ` · ${raffle.location.charAt(0).toLowerCase()}${raffle.location.slice(1)}` : ""}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="Visão" className="flex gap-0.5 rounded-[11px] border border-border bg-white p-[3px]">
          {(
            [
              ["part", "Participantes"],
              ["num", "Números"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "h-8 rounded-lg px-3.5 text-[13px] font-semibold",
                tab === k ? "bg-ink text-white" : "text-ink-soft",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {tab === "part" && (
          <div role="group" aria-label="Situação" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1">
            {chips.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  "h-[34px] shrink-0 whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] font-semibold",
                  filter === k
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-[#3D4A42]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "part" ? (
        entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-paper px-6 py-12 text-center text-[13px] text-ink-soft">
            Ninguém se cadastrou ainda. Compartilhe o link para começar.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-[14px] border border-border bg-white min-[820px]:block">
              <div
                className="grid items-end gap-2.5 border-b border-border bg-paper px-[18px] py-3 text-[10.5px] font-bold uppercase tracking-[.4px] text-ink-soft"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span>Participante</span>
                <span>Números</span>
                {rules.map((r) => (
                  <span
                    key={r.id}
                    className={cn("text-center leading-[1.3]", r.type === "bonus" && "text-[#8A6312]")}
                    title={r.text}
                  >
                    <span className="line-clamp-2">{r.text}</span>
                    {r.type === "bonus" && <span className="block">+1 número</span>}
                  </span>
                ))}
                <span>Situação</span>
              </div>
              {view.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    "grid items-center gap-2.5 border-b border-[#F0F4ED] px-[18px] py-3",
                    e.status === "excl" && "opacity-60",
                  )}
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <PersonCell entry={e} onOpen={() => setSelectedId(e.id)} />
                  <Balls entry={e} />
                  {rules.map((r) => (
                    <span key={r.id} className="flex justify-center">
                      <CheckButton entry={e} rule={r} disabled={pending || e.status === "excl"} onToggle={() => toggle(e, r)} />
                    </span>
                  ))}
                  <Situation entry={e} note={rowNote(raffle, e)} />
                </div>
              ))}
              <div className="px-[18px] py-3 text-xs text-ink-soft">
                Mostrando {view.length} de {counts.todos} · ordenado por cadastro mais recente
              </div>
            </div>

            {/* Mobile cards (board 11a) */}
            <ul className="flex flex-col gap-3 min-[820px]:hidden">
              {view.map((e) => (
                <li
                  key={e.id}
                  className={cn("rounded-2xl border border-border bg-white p-3.5", e.status === "excl" && "opacity-60")}
                >
                  <div className="flex items-center gap-3">
                    <PersonCell entry={e} onOpen={() => setSelectedId(e.id)} sub={`nº ${e.numbers.map((n) => padNumber(n.n)).join(", ") || "—"}`} />
                    <Situation entry={e} note="" />
                  </div>
                  {e.status !== "excl" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rules.map((r) => {
                        const on = !!e.checks[r.id] || !!e.waived[r.id];
                        return (
                          <button
                            key={r.id}
                            type="button"
                            aria-pressed={on}
                            disabled={pending || !!e.waived[r.id]}
                            onClick={() => toggle(e, r)}
                            className={cn(
                              "h-10 rounded-[10px] px-3 text-[12.5px] font-semibold",
                              on
                                ? r.type === "bonus"
                                  ? "border border-[#E7CF8E] bg-[#F6EAC6] text-[#6B4A0C]"
                                  : "border border-primary bg-primary text-white"
                                : "border-[1.5px] border-dashed border-[#C9D3CB] bg-white text-[#3D4A42]",
                            )}
                          >
                            {on ? "✓ " : r.type === "bonus" ? "+1 " : ""}
                            {r.text}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {rowNote(raffle, e) && <p className="mt-2 text-[11.5px] text-ink-soft">{rowNote(raffle, e)}</p>}
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <NumberMap raffle={raffle} entries={entries} />
      )}

      <ParticipantSheet
        storeId={storeId}
        origin={origin}
        raffle={raffle}
        entry={selected}
        entries={entries}
        customers={customers}
        userName={userName}
        onClose={() => setSelectedId(null)}
      />
      <RaffleFormSheet storeId={storeId} origin={origin} raffle={raffle} open={editOpen} onOpenChange={setEditOpen} />
      <DrawSheet
        storeId={storeId}
        raffle={raffle}
        entries={entries}
        userName={userName}
        open={drawOpen}
        onOpenChange={setDrawOpen}
        onOpenParticipant={(id) => {
          setDrawOpen(false);
          setSelectedId(id);
        }}
      />
      <ConfirmDialog
        open={confirm === "encerrar"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Encerrar inscrições agora?"
        text="Ninguém mais entra e ninguém escolhe número. Bônus liberados e ainda não escolhidos ficam para a loja escolher. Dá para reabrir até realizar o sorteio."
        cta="Encerrar"
        tone="amber"
        pending={pending}
        onConfirm={closeSignups}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  valueClass,
}: {
  label: string;
  value: string;
  note?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3.5">
      <span className="block text-[10.5px] font-bold uppercase tracking-[.5px] text-ink-soft">{label}</span>
      <span className={cn("tabular mt-1 block text-[22px] font-bold", valueClass)}>
        {value}
        {note && <span className="ml-1.5 text-[13px] font-medium text-ink-soft">{note}</span>}
      </span>
    </div>
  );
}

function PersonCell({ entry: e, onOpen, sub }: { entry: RaffleEntry; onOpen: () => void; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-[11px]">
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold"
        style={avatarColors(e.name)}
      >
        {initials(e.name)}
      </span>
      <span className="min-w-0">
        <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[13.5px] font-semibold text-ink hover:text-primary">
          {e.name}
        </button>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span
            className={cn(
              "rounded-full px-[7px] text-[10.5px] font-bold leading-4",
              e.customerId ? "bg-[#E7F4EC] text-[#2E7D4A]" : "bg-[#F6EAC6] text-[#8A6312]",
            )}
          >
            {e.customerId ? "Cliente" : "Lead"}
          </span>
          <span className="truncate">{sub ?? `${e.instagram ? `@${e.instagram} · ` : ""}${formatDate(e.createdAt)}`}</span>
        </span>
      </span>
    </span>
  );
}

function Balls({ entry: e }: { entry: RaffleEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {e.numbers.map((n) => (
        <span
          key={n.n}
          title={n.kind === "extra" ? "Exceção liberada pela loja" : n.kind === "bonus" ? "Número de bônus" : "Escolhido no link"}
          className={cn(
            "tabular inline-flex h-[26px] min-w-[30px] items-center justify-center rounded-full px-[7px] text-xs font-bold",
            n.kind === "extra"
              ? "border border-[#E7CF8E] bg-[#FBF6EC] text-[#8A6312]"
              : "border border-[#DCEAD4] bg-[#F2F8EF] text-primary",
          )}
        >
          {n.n}
        </span>
      ))}
      {e.slots.map((_, i) => (
        <span
          key={`s${i}`}
          title="Bônus liberado, aguardando escolha"
          className="tabular inline-flex h-[26px] min-w-[30px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#D9B868] bg-white px-[7px] text-xs font-bold text-[#8A6312]"
        >
          +1
        </span>
      ))}
    </span>
  );
}

function CheckButton({
  entry: e,
  rule: r,
  disabled,
  onToggle,
}: {
  entry: RaffleEntry;
  rule: RaffleRule;
  disabled: boolean;
  onToggle: () => void;
}) {
  const waived = e.waived[r.id];
  const on = !!e.checks[r.id] || !!waived;
  const bonus = r.type === "bonus";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${r.text}: ${e.name}`}
      title={waived ? `Dispensada por ${waived.by}: ${waived.reason}` : undefined}
      disabled={disabled || !!waived}
      onClick={onToggle}
      className={cn(
        "flex size-[34px] items-center justify-center rounded-[9px]",
        on
          ? bonus
            ? "border border-[#E7CF8E] bg-[#F6EAC6] text-[#8A6312]"
            : waived
              ? "border border-[#E7CF8E] bg-[#FBF1DC] text-[#8A5A0F]"
              : "border border-primary bg-primary text-white"
          : "border-[1.5px] border-dashed border-[#C9D3CB] bg-white text-[#C9D3CB]",
      )}
    >
      {bonus && !on ? <Plus className="size-[15px]" strokeWidth={2.4} /> : <Check className="size-[15px]" strokeWidth={3} />}
    </button>
  );
}

function Situation({ entry: e, note }: { entry: RaffleEntry; note: string }) {
  const s = ENTRY_STATUS[e.status];
  return (
    <span className="flex shrink-0 flex-col items-start gap-1">
      <Pill tone={s.tone} dot>
        {s.label}
      </Pill>
      {note && <span className="text-[11px] text-ink-soft">{note}</span>}
    </span>
  );
}

function NumberMap({ raffle, entries }: { raffle: Raffle; entries: RaffleEntry[] }) {
  const owner = useMemo(() => {
    const m = new Map<number, RaffleEntry>();
    for (const e of entries) for (const n of e.numbers) m.set(n.n, e);
    return m;
  }, [entries]);
  const numbers = Array.from({ length: totalNumbers(raffle) }, (_, i) => raffle.numberFrom + i);
  return (
    <div className="rounded-[14px] border border-border bg-white px-5 py-[18px]">
      <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3D4A42]">
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-primary" />Validado</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded bg-[#F6DFA8]" />A conferir</span>
        <span className="flex items-center gap-1.5"><span className="size-3.5 rounded border border-[#D6E2D0]" />Livre</span>
        <span className="flex-1" />
        <span className="hidden min-[820px]:inline">Passe o mouse num número para ver quem escolheu</span>
      </div>
      <div className="grid grid-cols-8 gap-[5px] min-[820px]:grid-cols-[repeat(20,minmax(0,1fr))]">
        {numbers.map((n) => {
          const e = owner.get(n);
          return (
            <span
              key={n}
              title={e ? `Nº ${n} · ${e.name}` : `Nº ${n} · livre`}
              className={cn(
                "tabular flex h-[34px] items-center justify-center rounded-[7px] text-[11.5px] font-semibold",
                !e
                  ? "border border-[#E1E9DE] text-ink-soft"
                  : e.status === "ok"
                    ? "bg-primary text-white"
                    : "bg-[#F6DFA8] text-[#6B470C]",
              )}
            >
              {padNumber(n)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
