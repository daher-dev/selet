"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, CircleAlert, Dices, Loader2, X } from "lucide-react";
import { padNumber } from "@/lib/raffles";
import { cn } from "@/lib/utils";

export type PickerMode = "cadastro" | "bonus" | "admin";

interface NumberPickerProps {
  mode: PickerMode;
  from: number;
  to: number;
  /** Every number already chosen by anyone (including `own`). */
  taken: number[];
  /** Numbers this person already has — shown as "yours", not selectable. */
  own?: number[];
  /** How many numbers to choose now. */
  quantos: number;
  title: string;
  /** A number someone else just took: shown red with a banner. */
  conflict?: number | null;
  pending?: boolean;
  /** Public flows: back arrow + wordmark. */
  onBack?: () => void;
  /** Store flow: close button next to the kicker. */
  onClose?: () => void;
  adminKicker?: string;
  /** Overrides "Confirmar o nº 23" / "Confirmar meus 3 números". */
  ctaLabel?: (picks: number[]) => string;
  onConfirm: (picks: number[]) => void;
  /** Hide the wordmark/back row when a host flow already draws one. */
  embedded?: boolean;
  className?: string;
}

function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/**
 * Number grid shared by the public sign-up, the bonus link and the store's
 * "escolher por ele" (board SorteioPicker: modes cadastro | bonus | admin).
 */
export function NumberPicker({
  mode,
  from,
  to,
  taken,
  own = [],
  quantos,
  title,
  conflict = null,
  pending = false,
  onBack,
  onClose,
  adminKicker = "Exceção · escolhido pela loja",
  ctaLabel,
  onConfirm,
  embedded = false,
  className,
}: NumberPickerProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const takenSet = useMemo(() => new Set(taken), [taken]);
  const ownSet = useMemo(() => new Set(own), [own]);
  // A pick someone else grabbed meanwhile silently drops out.
  const valid = picked.filter((n) => !takenSet.has(n));
  const multi = quantos > 1;
  const ready = valid.length === quantos;
  const numbers = useMemo(
    () => Array.from({ length: to - from + 1 }, (_, i) => from + i),
    [from, to],
  );

  function toggle(n: number) {
    if (takenSet.has(n)) return;
    if (quantos === 1) return setPicked([n]);
    if (valid.includes(n)) return setPicked(valid.filter((x) => x !== n));
    if (valid.length < quantos) setPicked([...valid, n]);
  }

  function surprise() {
    const free = numbers.filter((n) => !takenSet.has(n) && !valid.includes(n));
    if (!free.length) return;
    const n = free[randomIndex(free.length)];
    if (quantos === 1) setPicked([n]);
    else if (valid.length < quantos) setPicked([...valid, n]);
  }

  const one = valid.length ? padNumber(valid[0]) : "";
  const cta = ctaLabel
    ? ctaLabel(valid)
    : multi
      ? `Confirmar meus ${quantos} números`
      : `Confirmar o nº ${one}`;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-[#F6FAF4]", className)}>
      <div className="shrink-0 border-b border-border bg-white px-4 pb-3.5 pt-4">
        {mode !== "admin" && !embedded && (
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Voltar"
                className="-ml-2 flex size-11 items-center justify-center rounded-[10px] text-ink"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <span className="font-display text-[24px] font-semibold leading-none text-primary">
              Selet
            </span>
          </div>
        )}
        {mode === "admin" && (
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-[11px] font-bold uppercase tracking-[.5px] text-ink-soft">
              {adminKicker}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex size-9 items-center justify-center rounded-[9px] border border-border text-ink-soft"
              >
                <X className="size-[15px]" />
              </button>
            )}
          </div>
        )}

        <h1 className="mt-2 text-[21px] font-bold leading-tight tracking-[-.2px] text-ink">
          {title}
        </h1>

        {own.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-soft">
            <span>{mode === "admin" ? "Ele já tem:" : "Você já tem:"}</span>
            {own.map((n) => (
              <span
                key={n}
                className="tabular inline-flex h-[26px] min-w-8 items-center justify-center rounded-full border border-[#DCEAD4] bg-[#F2F8EF] px-2 text-[12.5px] font-bold text-primary"
              >
                {padNumber(n)}
              </span>
            ))}
          </div>
        )}
        {mode === "bonus" && (
          <p className="mt-2 rounded-[10px] border border-[#F0E4C8] bg-[#FBF6EC] px-[11px] py-[9px] text-[12.5px] leading-snug text-[#6B5320]">
            Bônus liberado porque você convidou alguém pro grupo VIP. Esse número soma aos que você já tem.
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[12px] text-[#3D4A42]">
          <span className="flex items-center gap-1.5">
            <span className="size-3.5 rounded bg-white ring-1 ring-inset ring-[#CFDACB]" />
            Livre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3.5 rounded bg-[#E7ECE5]" />
            {mode === "admin" ? "Ocupado" : "Já escolhido"}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={surprise}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#F0E4C8] bg-[#FBF6EC] px-3 text-[12.5px] font-bold text-[#8A6312]"
          >
            <Dices className="size-3.5" />
            {mode === "admin" ? "Sortear um livre" : "Me surpreenda"}
          </button>
        </div>
      </div>

      {conflict != null && (
        <div
          role="alert"
          className="mx-4 mt-3 flex shrink-0 items-start gap-2.5 rounded-xl border border-[#F2CFC4] bg-[#FBE9E4] px-[13px] py-[11px] text-[13px] leading-snug text-[#8E2E1B]"
        >
          <CircleAlert className="mt-px size-[18px] shrink-0" />
          <span>
            <strong className="font-bold">O {conflict} acabou de ser escolhido</strong> por outra
            pessoa. Escolha outro número; o resto do seu cadastro está salvo.
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3.5 pt-3">
        <div role="group" aria-label={`Números de ${from} a ${to}`} className="grid grid-cols-5 gap-2">
          {numbers.map((n) => {
            const isOwn = ownSet.has(n);
            const isTaken = takenSet.has(n) || isOwn;
            const isConflict = conflict === n;
            const on = valid.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                disabled={isTaken}
                aria-pressed={on}
                aria-label={`Número ${n}${isOwn ? ", já é seu" : isTaken ? ", ocupado" : ""}`}
                className={cn(
                  "tabular h-12 rounded-[11px] text-[15px] font-bold",
                  isOwn
                    ? "cursor-default border-[1.5px] border-[#9CC5AE] bg-[#F2F8EF] text-primary"
                    : isConflict
                      ? "cursor-not-allowed border-[1.5px] border-[#E3A08F] bg-[#FBE9E4] text-[#B23A22] line-through"
                      : isTaken
                        ? "cursor-not-allowed bg-[#E7ECE5] text-[#7D8A82] line-through"
                        : on
                          ? "bg-primary text-white shadow-[0_6px_16px_-8px_rgba(24,107,65,.8)]"
                          : "border border-[#CFDACB] bg-white text-ink",
                )}
              >
                {padNumber(n)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-white px-4 pb-5 pt-3">
        {multi && (
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex-1 text-[13px] font-semibold">
              {valid.length} de {quantos} escolhidos
            </span>
            {Array.from({ length: quantos }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "tabular inline-flex size-[34px] items-center justify-center rounded-full text-[13px] font-bold",
                  valid[i] != null
                    ? "bg-primary text-white"
                    : "border-[1.5px] border-dashed border-[#C9D3CB]",
                )}
              >
                {valid[i] != null ? padNumber(valid[i]) : ""}
              </span>
            ))}
          </div>
        )}
        {ready ? (
          <button
            type="button"
            onClick={() => onConfirm(valid)}
            disabled={pending}
            className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[13px] bg-primary text-[15px] font-bold text-white disabled:opacity-70"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {cta}
          </button>
        ) : (
          <div className="flex h-[54px] items-center justify-center rounded-[13px] bg-wash text-sm font-semibold text-ink-soft">
            {multi && valid.length ? `Falta escolher ${quantos - valid.length}` : "Toque num número livre"}
          </div>
        )}
      </div>
    </div>
  );
}
