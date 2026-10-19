"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { publishRaffleAction, saveRaffleAction } from "@/actions/raffles";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { slugify } from "@/lib/stock-settings";
import {
  MAX_PER_PERSON,
  isoToLocalInput,
  localInputToIso,
  type Raffle,
  type RaffleFields,
  type RaffleRule,
  type RuleType,
} from "@/lib/raffles";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { linkLabel } from "./ui";

const FIELD_CLASS = "h-[42px] rounded-[10px] border-[#DDE6DA] bg-white px-3 text-sm";
const DATE_CLASS = "h-[42px] rounded-[10px] border-[#DDE6DA] bg-white px-2.5 text-[13px]";
const LABEL_CLASS = "flex flex-col gap-1.5 text-xs font-semibold text-[#3D4A42]";
const H3_CLASS = "text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft";

const newRuleId = () => Math.random().toString(36).slice(2, 10);

/** Next full day at the given hour, as a datetime-local value in store time. */
function defaultInput(daysAhead: number, hh: string, mm: string): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return `${isoToLocalInput(d.toISOString()).slice(0, 11)}${hh}:${mm}`;
}

interface Props {
  storeId: string;
  origin: string;
  raffle: Raffle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RaffleFormSheet({ open, onOpenChange, ...rest }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden data-[side=right]:sm:max-w-[480px]">
        <SheetHeader className="border-b border-border">
          {rest.raffle && (
            <p className="text-[11px] font-bold uppercase tracking-wide text-leaf">Editar sorteio</p>
          )}
          <SheetTitle className="text-[19px] font-bold">
            {rest.raffle ? rest.raffle.name : "Novo sorteio"}
          </SheetTitle>
        </SheetHeader>
        <RaffleForm key={rest.raffle?.id ?? "new"} {...rest} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function RaffleForm({
  storeId,
  origin,
  raffle,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const published = !!raffle && raffle.status !== "rascunho";
  const [name, setName] = useState(raffle?.name ?? "");
  const [prize, setPrize] = useState(raffle?.prize ?? "");
  const [location, setLocation] = useState(raffle?.location ?? "Ao vivo no Instagram");
  const [signupUntil, setSignupUntil] = useState(
    raffle ? isoToLocalInput(raffle.signupUntil) : defaultInput(7, "23", "59"),
  );
  const [drawAt, setDrawAt] = useState(
    raffle ? isoToLocalInput(raffle.drawAt) : defaultInput(8, "19", "00"),
  );
  const [numberFrom, setNumberFrom] = useState(String(raffle?.numberFrom ?? 1));
  const [numberTo, setNumberTo] = useState(String(raffle?.numberTo ?? 100));
  const [perPerson, setPerPerson] = useState(raffle?.perPerson ?? 1);
  const [rules, setRules] = useState<RaffleRule[]>(raffle?.rules ?? []);
  const [fields, setFields] = useState<RaffleFields>(
    raffle?.fields ?? { instagram: true, birthday: false, email: false },
  );
  const [pickup, setPickup] = useState(raffle?.pickup ?? "Retirada na loja em até 30 dias");
  const [notes, setNotes] = useState(raffle?.notes ?? "");
  const [slug, setSlug] = useState(raffle?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!raffle?.slug);
  const [savedId, setSavedId] = useState<string | null>(raffle?.id ?? null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [pending, startTransition] = useTransition();

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function setRule(id: string, patch: Partial<RaffleRule>) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function build() {
    const until = localInputToIso(signupUntil);
    const draw = localInputToIso(drawAt);
    if (!until || !draw) {
      toast.error("Informe as datas das inscrições e do sorteio.");
      return null;
    }
    return {
      storeId,
      name,
      prize,
      location,
      pickup,
      notes,
      slug: effectiveSlug,
      signupFrom: raffle?.signupFrom ?? null,
      signupUntil: until,
      drawAt: draw,
      numberFrom: Number(numberFrom),
      numberTo: Number(numberTo),
      perPerson,
      rules,
      fields,
    };
  }

  /** Saves the draft/edits; resolves with the raffle id or null after toasting. */
  async function save(): Promise<string | null> {
    const input = build();
    if (!input) return null;
    const res = await saveRaffleAction(savedId, input);
    if (!res.ok || !res.id) {
      toast.error(res.error ?? "Não foi possível salvar.");
      return null;
    }
    setSavedId(res.id);
    return res.id;
  }

  function saveOnly() {
    startTransition(async () => {
      if (await save()) {
        toast.success(published ? "Alterações salvas." : "Rascunho salvo.");
        onClose();
      }
    });
  }

  function publish() {
    startTransition(async () => {
      const id = await save();
      if (!id) return setConfirmPublish(false);
      const res = await publishRaffleAction(storeId, id);
      setConfirmPublish(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Sorteio publicado. O link já aceita cadastros.");
      onClose();
    });
  }

  const lockHint = published ? (
    <span className="text-[11.5px] font-medium text-ink-soft">Travado depois de publicar.</span>
  ) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-[22px] py-5">
        <section className="flex flex-col gap-3">
          <label className={LABEL_CLASS}>
            Nome do sorteio
            <Input className={FIELD_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={LABEL_CLASS}>
            Prêmio
            <Input className={FIELD_CLASS} value={prize} onChange={(e) => setPrize(e.target.value)} />
          </label>
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
            <label className={LABEL_CLASS}>
              Inscrições até
              <Input
                type="datetime-local"
                className={cn(DATE_CLASS, "tabular")}
                value={signupUntil}
                onChange={(e) => setSignupUntil(e.target.value)}
              />
            </label>
            <label className={LABEL_CLASS}>
              Data do sorteio
              <Input
                type="datetime-local"
                className={cn(DATE_CLASS, "tabular")}
                value={drawAt}
                onChange={(e) => setDrawAt(e.target.value)}
              />
            </label>
          </div>
          <label className={LABEL_CLASS}>
            Onde acontece o sorteio
            <Input
              className={FIELD_CLASS}
              value={location}
              placeholder="Ex.: Ao vivo no Instagram @sualoja"
              onChange={(e) => setLocation(e.target.value)}
            />
            <span className="text-[11.5px] font-medium text-ink-soft">
              Aparece no link, no cartão do sorteio e no regulamento. Cada loja usa o próprio perfil aqui e nas regras.
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className={H3_CLASS}>Números da sorte</h3>
          <div className="grid grid-cols-3 gap-2.5">
            <label className={LABEL_CLASS}>
              De
              <Input
                inputMode="numeric"
                className={cn(FIELD_CLASS, "tabular")}
                value={numberFrom}
                disabled={published}
                onChange={(e) => setNumberFrom(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className={LABEL_CLASS}>
              Até
              <Input
                inputMode="numeric"
                className={cn(FIELD_CLASS, "tabular")}
                value={numberTo}
                disabled={published}
                onChange={(e) => setNumberTo(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <div className={LABEL_CLASS}>
              <span id="por-pessoa">Por pessoa</span>
              <div
                role="group"
                aria-labelledby="por-pessoa"
                className="flex h-[42px] items-center overflow-hidden rounded-[10px] border border-[#DDE6DA]"
              >
                <button
                  type="button"
                  aria-label="Menos um número por pessoa"
                  disabled={published}
                  onClick={() => setPerPerson((p) => Math.max(1, p - 1))}
                  className="h-full w-10 bg-paper text-[17px] text-[#3D4A42] disabled:opacity-50"
                >
                  −
                </button>
                <span className="tabular flex-1 text-center text-sm font-bold text-ink">{perPerson}</span>
                <button
                  type="button"
                  aria-label="Mais um número por pessoa"
                  disabled={published}
                  onClick={() => setPerPerson((p) => Math.min(MAX_PER_PERSON, p + 1))}
                  className="h-full w-10 bg-paper text-[17px] text-[#3D4A42] disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="text-[11.5px] text-ink-soft">
            Cada pessoa escolhe {perPerson} no cadastro. Números de bônus e exceções vêm além disso. {lockHint}
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline">
            <h3 className={cn(H3_CLASS, "flex-1")}>Regras</h3>
            <span className="text-[11.5px] text-ink-soft">Conferidas à mão pela equipe</span>
          </div>
          {rules.map((r) => {
            const bonus = r.type === "bonus";
            return (
              <div
                key={r.id}
                className={cn(
                  "flex flex-col gap-[9px] rounded-xl border p-3",
                  bonus ? "border-[#F0E4C8] bg-[#FBF6EC]" : "border-[#EEF3EA] bg-paper",
                )}
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Texto da regra"
                    placeholder="Ex.: Seguir @selet.vv"
                    value={r.text}
                    onChange={(e) => setRule(r.id, { text: e.target.value })}
                    className="h-[38px] min-w-0 flex-1 rounded-[9px] border-[#DDE6DA] bg-white px-2.5 text-[13.5px]"
                  />
                  <button
                    type="button"
                    aria-label="Remover regra"
                    onClick={() => setRules((rs) => rs.filter((x) => x.id !== r.id))}
                    className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] text-ink-soft hover:bg-wash"
                  >
                    <Trash2 className="size-[15px]" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Tipo da regra"
                    className="flex gap-0.5 rounded-[10px] border border-border bg-white p-[3px]"
                  >
                    {(["obr", "bonus"] as RuleType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={r.type === t}
                        onClick={() => setRule(r.id, { type: t })}
                        className={cn(
                          "h-[30px] rounded-[7px] px-[11px] text-xs font-semibold",
                          r.type === t
                            ? t === "bonus"
                              ? "bg-[#8A6312] text-white"
                              : "bg-primary text-white"
                            : "text-ink-soft",
                        )}
                      >
                        {t === "obr" ? "Obrigatória" : "Bônus"}
                      </button>
                    ))}
                  </div>
                  <span className={cn("flex-1 text-[11.5px]", bonus ? "text-[#8A6312]" : "text-ink-soft")}>
                    {bonus ? "Vale +1 número quando conferida" : "Sem ela, não valida a participação"}
                  </span>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setRules((rs) => [...rs, { id: newRuleId(), text: "", type: "obr" }])}
            className="flex h-[42px] items-center justify-center gap-[7px] rounded-[11px] border border-dashed border-[#CFDACB] bg-white text-[13px] font-semibold text-[#3D4A42]"
          >
            <Plus className="size-3.5" />
            Adicionar regra
          </button>
        </section>

        <section className="flex flex-col gap-2.5">
          <h3 className={H3_CLASS}>O que o cadastro pede</h3>
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[#EEF3EA] bg-[#F0F4ED]">
            <div className="flex items-center gap-2.5 bg-white px-3.5 py-[11px]">
              <span className="flex-1 text-[13px]">Nome</span>
              <span className="text-[11.5px] text-ink-soft">Sempre</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white px-3.5 py-[11px]">
              <span className="flex-1 text-[13px]">WhatsApp</span>
              <span className="text-[11.5px] text-ink-soft">Sempre · identifica o lead</span>
            </div>
            {(
              [
                ["instagram", "Instagram"],
                ["birthday", "Data de nascimento"],
                ["email", "E-mail"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2.5 bg-white py-[7px] pl-3.5 pr-2.5">
                <span className="flex-1 text-[13px]">{label}</span>
                <Switch
                  aria-label={`Pedir ${label}`}
                  checked={fields[key]}
                  onCheckedChange={(on) => setFields((f) => ({ ...f, [key]: on }))}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <label className={LABEL_CLASS}>
            Prêmio: prazo e retirada
            <Input className={FIELD_CLASS} value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </label>
          <label className={cn(LABEL_CLASS, "mt-2")}>
            <span>
              Observações do regulamento{" "}
              <span className="font-medium text-ink-soft">(opcional; o resto é gerado com os dados acima)</span>
            </span>
            <Textarea
              rows={2}
              value={notes}
              placeholder="Ex.: válido só para maiores de 18 anos"
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none rounded-[10px] border-[#DDE6DA] bg-white px-3 py-2.5 text-[13.5px]"
            />
          </label>
        </section>

        <section className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>
            Endereço do link
            <span
              className={cn(
                "flex h-[42px] items-center overflow-hidden rounded-[10px] border border-[#DDE6DA] bg-white",
                published && "opacity-60",
              )}
            >
              <span className="whitespace-nowrap pl-3 pr-0.5 text-[13.5px] font-medium text-ink-soft">
                {linkLabel(origin, "").replace(/\/$/, "")}/
              </span>
              <input
                value={effectiveSlug}
                disabled={published}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-[13.5px] text-ink outline-none"
              />
            </span>
            {published && lockHint}
          </label>
        </section>
      </div>

      <SheetFooter className="flex-row gap-2.5 border-t border-border px-[22px] py-3.5">
        {published ? (
          <button
            type="button"
            onClick={saveOnly}
            disabled={pending}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[11px] bg-primary text-[13.5px] font-semibold text-white disabled:opacity-70"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar alterações
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={saveOnly}
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center rounded-[11px] border border-border bg-white text-[13.5px] font-semibold text-ink disabled:opacity-70"
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              onClick={() => setConfirmPublish(true)}
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[11px] bg-primary text-[13.5px] font-semibold text-white disabled:opacity-70"
            >
              Publicar e gerar link
            </button>
          </>
        )}
      </SheetFooter>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={`Publicar "${name.trim() || "este sorteio"}"?`}
        text={`O link ${linkLabel(origin, effectiveSlug)} passa a aceitar cadastros. Depois de publicar, faixa de números e números por pessoa ficam travados; regras e textos ainda podem mudar.`}
        cta="Publicar"
        pending={pending}
        onConfirm={publish}
      />
    </>
  );
}
