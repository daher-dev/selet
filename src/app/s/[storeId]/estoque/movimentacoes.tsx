"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Loader2, PackageOpen, Pencil, ShoppingBag, ShoppingCart, Store, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StockItem, StockLocation, StockMovement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listMovementsAction } from "@/actions/stock";
import { useUnits } from "@/components/stock-settings-context";
import {
  dayLabel,
  describeMovement,
  type LedgerKind,
  type LedgerRow,
  type MovementKind,
} from "@/lib/stock-ledger";
import { pkgCount } from "./stock-view";

type LocFilter = "tudo" | StockLocation;
type KindFilter = "todos" | MovementKind;

const KINDS: { value: KindFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "consumo", label: "Consumo" },
  { value: "compra", label: "Compras" },
  { value: "transf", label: "Transferências" },
  { value: "ajuste", label: "Ajustes" },
];

const KIND_STYLE: Record<LedgerKind, { icon: LucideIcon; bg: string; fg: string }> = {
  consumo: { icon: ShoppingBag, bg: "bg-mist", fg: "text-primary" },
  compra: { icon: ShoppingCart, bg: "bg-depot-wash", fg: "text-depot" },
  transf: { icon: ArrowRight, bg: "bg-depot-wash", fg: "text-depot" },
  abertura: { icon: PackageOpen, bg: "bg-violet-wash", fg: "text-violet" },
  ajuste: { icon: Pencil, bg: "bg-amber-wash", fg: "text-[#8a5a0f]" },
};

const TONE_FG = { ink: "text-ink", depot: "text-depot", amber: "text-[#8a5a0f]" } as const;

/**
 * The item's Movimentações ledger (design 2a/2b): filter by where (Loja /
 * Depósito) and by type, grouped by day, loading older entries as it scrolls.
 * A manual entrada/saída opens its correction form from the row.
 */
export function Movimentacoes({
  storeId,
  item,
  reloadKey,
  onEdit,
}: {
  storeId: string;
  item: StockItem;
  /** Bumped by the sheet after anything that changes the ledger. */
  reloadKey: number;
  onEdit: (movement: StockMovement) => void;
}) {
  const { unitLabel } = useUnits();
  const [loc, setLoc] = useState<LocFilter>("tudo");
  const [kind, setKind] = useState<KindFilter>("todos");
  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Guards against a slow response from a previous filter landing on the current list.
  const generation = useRef(0);

  const query = useCallback(
    (before?: string) =>
      listMovementsAction(storeId, item.id, {
        loc: loc === "tudo" ? undefined : loc,
        kind: kind === "todos" ? undefined : kind,
        before,
      }),
    [storeId, item.id, loc, kind],
  );

  useEffect(() => {
    const gen = ++generation.current;
    query()
      .then((page) => {
        if (gen !== generation.current) return;
        setRows(page.rows);
        setNext(page.next);
      })
      .catch(() => {
        if (gen === generation.current) setRows([]);
      });
  }, [query, reloadKey]);

  const loadMore = useCallback(() => {
    if (!next || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    query(next)
      .then((page) => {
        if (gen !== generation.current) return;
        setRows((prev) => [...(prev ?? []), ...page.rows]);
        setNext(page.next);
      })
      .catch(() => {
        if (gen === generation.current) setNext(null);
      })
      .finally(() => setLoadingMore(false));
  }, [next, loadingMore, query]);

  // Auto-load when the "carregando" row scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore]);

  const describe = (m: StockMovement): LedgerRow =>
    describeMovement(m, {
      storeId,
      pkg: (n) => pkgCount(item, n),
      unit: (n) => unitLabel(item.unit, n !== 1),
      continuousUse: item.continuousUse,
    });

  const days: { label: string; rows: { m: StockMovement; row: LedgerRow }[] }[] = [];
  for (const m of rows ?? []) {
    const label = dayLabel(m.at);
    let day = days.find((d) => d.label === label);
    if (!day) days.push((day = { label, rows: [] }));
    day.rows.push({ m, row: describe(m) });
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center">
        <span className="flex-1 text-[11px] font-bold uppercase tracking-[.5px] text-ink-soft">Movimentações</span>
        {item.tracked && (
          <div role="group" aria-label="Local" className="flex rounded-lg bg-[#f1f6ee] p-0.5">
            {(["tudo", "loja", "deposito"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={loc === v}
                onClick={() => setLoc(v)}
                className={cn(
                  "flex h-7 items-center gap-[5px] rounded-md px-2.5 text-[12px] font-semibold transition-colors",
                  loc === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "text-ink-soft",
                )}
              >
                {v === "loja" && <Store className="size-3 text-primary" strokeWidth={2.2} />}
                {v === "deposito" && <Warehouse className="size-3 text-depot" strokeWidth={2.2} />}
                {v === "tudo" ? "Tudo" : v === "loja" ? "Loja" : "Depósito"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div role="group" aria-label="Tipo" className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => setKind(k.value)}
            className={cn(
              "h-[30px] rounded-full border px-[11px] text-[12px] font-semibold transition-colors",
              kind === k.value ? "border-ink bg-ink text-white" : "border-border bg-white text-[#3d4a42] hover:border-primary/40",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {days.map((day) => (
        <div key={day.label} className="mb-3">
          <span className="mb-1.5 ml-0.5 block text-[12px] font-bold text-[#3d4a42]">{day.label}</span>
          <div className="flex flex-col overflow-hidden rounded-xl border border-[#eef3ea]">
            {day.rows.map(({ m, row }, i) => (
              <LedgerRowView key={m.id} row={row} first={i === 0} onEdit={row.editable ? () => onEdit(m) : undefined} />
            ))}
          </div>
        </div>
      ))}

      {rows !== null && rows.length === 0 && (
        <span className="block rounded-xl border border-dashed border-[#dde6d9] p-[18px] text-center text-[12.5px] text-ink-soft">
          Nenhuma movimentação com esses filtros.
        </span>
      )}

      {next && (
        <div ref={sentinel} role="status" className="flex items-center justify-center gap-2 p-2 text-[12px] text-ink-soft">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.4} aria-hidden />
          Carregando movimentações anteriores…
          {typeof IntersectionObserver === "undefined" && (
            <button type="button" onClick={loadMore} className="font-semibold text-primary underline">
              carregar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LedgerRowView({ row, first, onEdit }: { row: LedgerRow; first: boolean; onEdit?: () => void }) {
  const style = KIND_STYLE[row.kind];
  const Icon = style.icon;
  const content = (
    <>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", style.bg, style.fg)}>
        <Icon className="size-[15px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">
          {row.title}
          {row.link &&
            (row.link.href ? (
              <>
                {" "}
                <Link
                  href={row.link.href}
                  className={cn("underline", style.fg)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.link.text}
                </Link>
              </>
            ) : (
              <span> {row.link.text}</span>
            ))}
        </span>
        <span className="mt-px block truncate text-[11.5px] text-ink-soft">{row.meta}</span>
      </span>
      <span className={cn("tabular shrink-0 text-[13px] font-bold", TONE_FG[row.tone])}>{row.delta}</span>
      {onEdit ? (
        <Pencil className="size-3.5 shrink-0 text-ink-faint" strokeWidth={2.2} aria-hidden />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-transparent" strokeWidth={2.2} aria-hidden />
      )}
    </>
  );
  const cls = cn(
    "flex items-center gap-[11px] px-3 py-[11px] text-left",
    !first && "border-t border-[#eef3ea]",
  );
  return onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Editar ${row.title.replace(/ ·$/, "").toLowerCase()} · ${row.delta}`}
      className={cn(cls, "w-full transition-colors hover:bg-[#f7faf5]")}
    >
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}
