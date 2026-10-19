"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, Gift, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { publishRaffleAction } from "@/actions/raffles";
import { usePageAction } from "@/components/shell/app-shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatDrawAt,
  obligatoryRules,
  totalNumbers,
  type Raffle,
} from "@/lib/raffles";
import type { RaffleSummary } from "@/data/raffles";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { RaffleFormSheet } from "./raffle-form-sheet";
import { Pill, RAFFLE_STATUS, SorteiosTabs, copyLink, linkLabel, shareLink } from "./ui";

interface Props {
  storeId: string;
  raffles: RaffleSummary[];
  leadCounts: { total: number; novos: number };
  origin: string;
}

const FOOTER = "flex items-center gap-2 border-t border-[#EEF3EA] bg-paper py-3 pl-5 pr-3.5";
const BTN_OUTLINE =
  "flex h-11 items-center justify-center rounded-[9px] border border-border bg-white px-3 text-[12.5px] font-semibold text-ink min-[820px]:h-[34px]";
const BTN_PRIMARY =
  "flex h-11 items-center justify-center gap-1.5 rounded-[9px] bg-primary px-3 text-[12.5px] font-semibold text-white min-[820px]:h-[34px]";

export function SorteiosClient({ storeId, raffles, leadCounts, origin }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Raffle | null>(null);
  const [toPublish, setToPublish] = useState<Raffle | null>(null);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  usePageAction({ label: "Novo sorteio", onClick: openNew });

  function publish() {
    if (!toPublish) return;
    startTransition(async () => {
      const res = await publishRaffleAction(storeId, toPublish.id);
      setToPublish(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Sorteio publicado. O link já aceita cadastros.");
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <SorteiosTabs storeId={storeId} active="sorteios" sorteios={raffles.length} novos={leadCounts.novos} />

      {raffles.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="Nenhum sorteio ainda"
          description="Crie um sorteio, compartilhe o link e cada pessoa que se cadastrar vira um lead, já com o número da sorte escolhido."
          action={
            <div className="flex flex-col items-center gap-5">
              <ol className="flex flex-col gap-2 text-left text-[12.5px] text-[#3D4A42] min-[560px]:flex-row min-[560px]:gap-4">
                {["Prêmio e números", "Regras", "Publicar e compartilhar"].map((step, i) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#E7F4EC] text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={openNew}
                className="flex h-11 items-center rounded-xl bg-primary px-5 text-[13.5px] font-semibold text-white"
              >
                Criar primeiro sorteio
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[820px]:grid-cols-2">
          {raffles.map((r) => (
            <RaffleCard
              key={r.id}
              raffle={r}
              storeId={storeId}
              origin={origin}
              onEdit={() => {
                setEditing(r);
                setFormOpen(true);
              }}
              onPublish={() => setToPublish(r)}
            />
          ))}
        </div>
      )}

      <RaffleFormSheet
        storeId={storeId}
        origin={origin}
        raffle={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <ConfirmDialog
        open={!!toPublish}
        onOpenChange={(o) => !o && setToPublish(null)}
        title={`Publicar "${toPublish?.name ?? ""}"?`}
        text={`O link ${toPublish ? linkLabel(origin, toPublish.slug) : ""} passa a aceitar cadastros. Depois de publicar, faixa de números e números por pessoa ficam travados; regras e textos ainda podem mudar.`}
        cta="Publicar"
        pending={pending}
        onConfirm={publish}
      />
    </div>
  );
}

function RaffleCard({
  raffle: r,
  storeId,
  origin,
  onEdit,
  onPublish,
}: {
  raffle: RaffleSummary;
  storeId: string;
  origin: string;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const st = RAFFLE_STATUS[r.status];
  const detail = `/painel/${storeId}/sorteios/${r.id}`;
  const total = totalNumbers(r);
  const draft = r.status === "rascunho";
  const done = r.status === "sorteado";

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-white",
        draft ? "border border-dashed border-[#CFDACB]" : "border border-border",
      )}
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-[18px]">
        <div className="flex items-center gap-2">
          <Pill tone={st.tone} dot={st.dot}>
            {st.label}
          </Pill>
          <span className="flex-1" />
          <span className="text-xs text-ink-soft">Sorteio {formatDrawAt(r.drawAt)}</span>
        </div>
        <div>
          <Link
            href={draft ? "#" : detail}
            onClick={draft ? (e) => (e.preventDefault(), onEdit()) : undefined}
            className="block text-lg font-bold text-ink hover:text-primary"
          >
            {r.name}
          </Link>
          <p className="mt-[3px] text-[13px] text-ink-soft">Prêmio: {r.prize}</p>
        </div>

        {draft && (
          <ul className="flex flex-col gap-1.5 text-[12.5px] text-[#3D4A42]">
            <li className="flex gap-2">
              <span className="w-[118px] text-ink-soft">Números</span>
              {r.numberFrom} a {r.numberTo} · {r.perPerson} por pessoa
            </li>
            <li className="flex gap-2">
              <span className="w-[118px] text-ink-soft">Regras</span>
              {obligatoryRules(r.rules).length} obrigatórias · {r.rules.length - obligatoryRules(r.rules).length} de bônus
            </li>
          </ul>
        )}

        {!draft && !done && (
          <>
            <div>
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="tabular text-[22px] font-bold tracking-[-.4px]">{r.numberCount}</span>
                <span className="text-[12.5px] text-ink-soft">
                  de {total} números escolhidos · {r.entryCount}{" "}
                  {r.entryCount === 1 ? "participante" : "participantes"}
                </span>
              </div>
              <div className="mt-2 h-[7px] overflow-hidden rounded bg-wash">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, (r.numberCount / total) * 100)}%` }}
                />
              </div>
            </div>
            {r.pendingCount > 0 && (
              <Link
                href={detail}
                className="flex items-center gap-[9px] rounded-[10px] bg-[#FBF1DC] px-3 py-2.5 text-[12.5px] font-semibold text-[#8A5A0F]"
              >
                <ClipboardCheck className="size-[15px] shrink-0" />
                <span className="flex-1">
                  {r.pendingCount}{" "}
                  {r.pendingCount === 1 ? "participante aguardando" : "participantes aguardando"} conferência das regras
                </span>
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </>
        )}

        {done && r.winner && (
          <div className="flex items-center gap-3 rounded-xl border border-[#F0E4C8] bg-[#FBF6EC] px-3.5 py-3">
            <span className="tabular flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-[17px] font-bold text-white">
              {r.winner.number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10.5px] font-bold uppercase tracking-[.5px] text-[#8A6312]">
                Ganhador(a)
              </span>
              <span className="block truncate text-sm font-semibold">{r.winner.name}</span>
            </span>
            <span className="text-xs text-ink-soft">{r.entryCount} participantes</span>
          </div>
        )}
      </div>

      {draft ? (
        <div className={FOOTER}>
          <span className="flex-1 text-[12.5px] text-ink-soft">O link é gerado ao publicar</span>
          <button type="button" onClick={onEdit} className={BTN_OUTLINE}>
            Editar
          </button>
          <button type="button" onClick={onPublish} className={BTN_PRIMARY}>
            Publicar
          </button>
        </div>
      ) : done ? (
        <div className={FOOTER}>
          <a
            href={`/s/${r.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-[12.5px] font-semibold text-primary"
          >
            Link encerrado · ver o resultado
          </a>
          <Link href={`/painel/${storeId}/sorteios/leads?sorteio=${r.id}`} className={BTN_OUTLINE}>
            Ver {r.entryCount} leads
          </Link>
        </div>
      ) : (
        <div className={FOOTER}>
          <Link2 className="size-[15px] shrink-0 text-ink-soft" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{linkLabel(origin, r.slug)}</span>
          <button type="button" onClick={() => copyLink(origin, r.slug)} className={BTN_OUTLINE}>
            Copiar link
          </button>
          <button type="button" onClick={() => shareLink(origin, r.slug, r.name)} className={BTN_PRIMARY}>
            <Share2 className="size-3.5" />
            Compartilhar
          </button>
        </div>
      )}
    </article>
  );
}
