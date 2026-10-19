"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { firstName, ruleDone, type Raffle, type RaffleEntry } from "@/lib/raffles";
import { cn } from "@/lib/utils";

const REASONS = ["Compra acima de R$ 100", "Indicou amigos", "Cortesia da loja"];
const LABEL = "text-xs font-semibold text-[#3D4A42]";

function Stamp({ by }: { by: string }) {
  return (
    <p className="text-[11.5px] text-ink-soft">
      Fica registrado como <strong className="font-semibold text-ink">{by}</strong> · agora
    </p>
  );
}

function Actions({
  cta,
  pending,
  disabled,
  tone = "primary",
  onCancel,
  onConfirm,
}: {
  cta: string;
  pending: boolean;
  disabled: boolean;
  tone?: "primary" | "amber";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-2.5">
      <button
        type="button"
        onClick={onCancel}
        className="h-[42px] rounded-[10px] border border-border bg-white px-4 text-[13px] font-semibold text-ink"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending || disabled}
        className={cn(
          "flex h-[42px] items-center gap-2 rounded-[10px] px-4 text-[13px] font-bold text-white disabled:opacity-50",
          tone === "amber" ? "bg-[#8A5A0F]" : "bg-primary",
        )}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {cta}
      </button>
    </div>
  );
}

/** Número extra: quantos, motivo, quem escolhe (board 7a, left). */
export function ExtraNumberDialog({
  open,
  onOpenChange,
  entry,
  by,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RaffleEntry;
  by: string;
  pending: boolean;
  onConfirm: (v: { count: number; reason: string; chooser: "pessoa" | "loja" }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-[460px]">
        {open && (
          <ExtraForm
            key={entry.id}
            entry={entry}
            by={by}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExtraForm({
  entry,
  by,
  pending,
  onCancel,
  onConfirm,
}: {
  entry: RaffleEntry;
  by: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (v: { count: number; reason: string; chooser: "pessoa" | "loja" }) => void;
}) {
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState("");
  const [chooser, setChooser] = useState<"pessoa" | "loja">("pessoa");
  const name = firstName(entry.name);
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-[17px] font-bold">Número extra para {name}</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-soft">
          Além do número do cadastro e dos bônus.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3">
        <span className={cn(LABEL, "flex-1")}>Quantos números</span>
        <div className="flex h-[42px] items-center overflow-hidden rounded-[10px] border border-[#DDE6DA]">
          <button
            type="button"
            aria-label="Menos"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="h-full w-10 bg-paper text-[17px]"
          >
            −
          </button>
          <span className="tabular w-10 text-center text-sm font-bold">{count}</span>
          <button
            type="button"
            aria-label="Mais"
            onClick={() => setCount((c) => Math.min(5, c + 1))}
            className="h-full w-10 bg-paper text-[17px]"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="extra-motivo" className={LABEL}>
          Motivo (obrigatório, aparece na ficha)
        </label>
        <Input
          id="extra-motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-[42px] rounded-[10px] border-[#DDE6DA] bg-white px-3 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="h-[30px] rounded-full border border-border bg-[#F4F7F2] px-2.5 text-xs text-[#3D4A42]"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={cn(LABEL, "mb-1")}>Quem escolhe o número</legend>
        {(
          [
            ["pessoa", "Ele, pelo link", "Mandamos no WhatsApp um link só dele"],
            ["loja", "A loja, agora", "Abre o seletor para você escolher"],
          ] as const
        ).map(([value, title, hint]) => (
          <label
            key={value}
            className={cn(
              "flex items-start gap-2.5 rounded-[11px] border p-3",
              chooser === value ? "border-primary/40 bg-[#F2F8EF]" : "border-border",
            )}
          >
            <input
              type="radio"
              name="quem"
              checked={chooser === value}
              onChange={() => setChooser(value)}
              className="mt-0.5 size-[17px] accent-[#186B41]"
            />
            <span>
              <span className="block text-[13px] font-semibold">{title}</span>
              <span className="block text-[11.5px] text-ink-soft">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Stamp by={by} />
        </div>
        <Actions
        cta="Liberar número"
        pending={pending}
        disabled={reason.trim().length < 3}
        onCancel={onCancel}
        onConfirm={() => onConfirm({ count, reason: reason.trim(), chooser })}
      />
      </div>
    </div>
  );
}

/** Dispensar uma regra obrigatória (board 7a, right). */
export function WaiveRuleDialog({
  open,
  onOpenChange,
  entry,
  raffle,
  by,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: RaffleEntry;
  raffle: Raffle;
  by: string;
  pending: boolean;
  onConfirm: (v: { ruleId: string; reason: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-[460px]">
        {open && (
          <WaiveForm
            key={entry.id}
            entry={entry}
            raffle={raffle}
            by={by}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WaiveForm({
  entry,
  raffle,
  by,
  pending,
  onCancel,
  onConfirm,
}: {
  entry: RaffleEntry;
  raffle: Raffle;
  by: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (v: { ruleId: string; reason: string }) => void;
}) {
  const rules = raffle.rules.filter((r) => r.type === "obr");
  const firstPending = rules.find((r) => !ruleDone(entry, r.id));
  const [ruleId, setRuleId] = useState(firstPending?.id ?? "");
  const [reason, setReason] = useState("");
  const others = rules.filter((r) => r.id !== ruleId && !ruleDone(entry, r.id)).length;
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="text-[17px] font-bold">Dispensar regra para {firstName(entry.name)}</DialogTitle>
        <DialogDescription className="text-[13px] text-ink-soft">Conta como cumprida só para ela.</DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-col gap-2">
        <legend className={cn(LABEL, "mb-1")}>Qual regra</legend>
        {rules.map((r) => {
          const done = ruleDone(entry, r.id);
          return (
            <label
              key={r.id}
              className={cn(
                "flex items-center gap-2.5 rounded-[11px] border p-3",
                ruleId === r.id ? "border-primary/40 bg-[#F2F8EF]" : "border-border",
                done && "opacity-60",
              )}
            >
              <input
                type="radio"
                name="regra"
                disabled={done}
                checked={ruleId === r.id}
                onChange={() => setRuleId(r.id)}
                className="size-[17px] accent-[#186B41]"
              />
              <span className="flex-1 text-[13px] font-semibold">{r.text}</span>
              <span className={cn("text-[11px] font-bold", done ? "text-[#2E7D4A]" : "text-[#8A5A0F]")}>
                {done ? "Já cumprida" : "Pendente"}
              </span>
            </label>
          );
        })}
        <p className="text-[11.5px] text-ink-soft">
          Regras de bônus não aparecem aqui: para dar número a mais, use &quot;Número extra&quot;.
        </p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="waive-motivo" className={LABEL}>
          Motivo (obrigatório)
        </label>
        <Textarea
          id="waive-motivo"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="resize-none rounded-[10px] border-[#DDE6DA] bg-white px-3 py-2.5 text-[13.5px]"
        />
      </div>

      {ruleId && others === 0 && (
        <p className="rounded-[10px] bg-[#F2F8EF] px-3 py-2.5 text-[12.5px] text-[#37543F]">
          Com isso, {firstName(entry.name)} passa a Validada.
        </p>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Stamp by={by} />
        </div>
        <Actions
        cta="Dispensar"
        tone="amber"
        pending={pending}
        disabled={!ruleId || reason.trim().length < 3}
        onCancel={onCancel}
        onConfirm={() => onConfirm({ ruleId, reason: reason.trim() })}
      />
      </div>
    </div>
  );
}
