"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { announceResultAction, confirmWinnerAction, excludeEntryAction } from "@/actions/raffles";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { initials } from "@/lib/format";
import { formatPhone, padNumber, type DrawLogEntry, type Raffle, type RaffleEntry } from "@/lib/raffles";
import { cn } from "@/lib/utils";
import { avatarColors } from "./ui";

interface Props {
  storeId: string;
  raffle: Raffle;
  entries: RaffleEntry[];
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenParticipant: (entryId: string) => void;
}

const nowHm = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

export function DrawSheet({ open, onOpenChange, ...rest }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[480px]" showCloseButton={false}>
        <SheetTitle className="sr-only">Realizar sorteio</SheetTitle>
        {open && <Draw key={rest.raffle.id} {...rest} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function Draw({
  storeId,
  raffle,
  entries,
  userName,
  onOpenParticipant,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [mode, setMode] = useState<"informar" | "sortear">("informar");
  const [num, setNum] = useState("");
  const [step, setStep] = useState<"escolher" | "anunciar">(raffle.status === "sorteado" ? "anunciar" : "escolher");
  const [hist, setHist] = useState<DrawLogEntry[]>([]);
  const [out, setOut] = useState<Set<number>>(new Set());
  const [avisos, setAvisos] = useState({ link: true, wpp: true, todos: false });
  const [pending, startTransition] = useTransition();

  const owners = useMemo(() => {
    const m = new Map<number, RaffleEntry>();
    for (const e of entries) if (e.status !== "excl") for (const n of e.numbers) m.set(n.n, e);
    return m;
  }, [entries]);
  const okEntries = entries.filter((e) => e.status === "ok");
  const okNumbers = okEntries.flatMap((e) => e.numbers.map((n) => n.n)).filter((n) => !out.has(n));
  const pendingCount = entries.filter((e) => e.status === "pend").length;

  const n = parseInt(num, 10);
  const inRange = Number.isInteger(n) && n >= raffle.numberFrom && n <= raffle.numberTo;
  const who = inRange && !out.has(n) ? (owners.get(n) ?? null) : null;
  const ok = who?.status === "ok";
  const winner = raffle.winner ? entries.find((e) => e.id === raffle.winner!.entryId) : null;

  const log = (text: string) => setHist((h) => [...h, { at: nowHm(), text }]);

  function draw() {
    if (!okNumbers.length) return void toast.error("Ninguém validado para sortear.");
    const pick = okNumbers[randomIndex(okNumbers.length)];
    setNum(String(pick));
    log(`Sorteado aqui: nº ${pick}`);
  }

  function disqualify() {
    if (!who) return;
    startTransition(async () => {
      const res = await excludeEntryAction(storeId, who.id, "Desclassificado no sorteio (regras pendentes)");
      if (!res.ok) return void toast.error(res.error);
      log(`Nº ${n} desclassificado (${who.name}, regras pendentes)`);
      setOut((s) => new Set(s).add(n));
      setNum("");
    });
  }

  function confirm() {
    if (!ok) return;
    startTransition(async () => {
      const res = await confirmWinnerAction(storeId, raffle.id, n, hist);
      if (!res.ok) return void toast.error(res.error);
      setStep("anunciar");
    });
  }

  function announce() {
    startTransition(async () => {
      const res = await announceResultAction(storeId, raffle.id, {
        showResult: avisos.link,
        notifyWinner: avisos.wpp,
        notifyAll: avisos.todos,
      });
      if (!res.ok) return void toast.error(res.error);
      if (res.failed) {
        toast.warning(`Resultado publicado, mas ${res.failed} aviso(s) por WhatsApp não saíram. O envio ainda não está configurado.`);
      } else {
        toast.success("Resultado publicado.");
      }
      onClose();
    });
  }

  const winnerNum = raffle.winner?.number ?? n;
  const winnerName = raffle.winner?.name ?? who?.name ?? "";
  const winnerIg = (winner ?? who)?.instagram;
  const igText = `Temos ganhador(a)! O nº ${padNumber(winnerNum)} saiu${winnerIg ? ` para @${winnerIg}` : ""} no sorteio "${raffle.name}".\nObrigado a todo mundo que participou!`;

  const AVISOS = [
    ["link", "Mostrar resultado no link", "Quem abrir o link vê o número e o nome abreviado"],
    ["wpp", "Avisar o ganhador no WhatsApp", "Mensagem pronta com como retirar o prêmio"],
    ["todos", "Avisar todos os participantes", "Todos que aceitaram o regulamento deste sorteio"],
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#EEF3EA] px-[22px] py-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Realizar sorteio</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">
            {raffle.name} · {raffle.prize}
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

      {step === "escolher" ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">
            <p className="rounded-[11px] bg-[#F2F8EF] px-3.5 py-3 text-[13px] text-[#37543F]">
              Concorrem <strong>{okNumbers.length} números</strong> de <strong>{okEntries.length} participantes validados</strong>.{" "}
              {pendingCount > 0 && `${pendingCount} ainda ${pendingCount === 1 ? "está" : "estão"} a conferir.`}
            </p>

            <div role="tablist" aria-label="Como sortear" className="grid grid-cols-2 gap-0.5 rounded-[11px] bg-[#EEF3EA] p-[3px]">
              {(
                [
                  ["informar", "Informar número da live"],
                  ["sortear", "Sortear aqui"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={mode === k}
                  onClick={() => {
                    setMode(k);
                    if (k === "sortear") setNum("");
                  }}
                  className={cn(
                    "h-[38px] rounded-lg text-[13px] font-semibold",
                    mode === k ? "bg-white text-ink shadow-[0_1px_3px_rgba(21,35,28,.12)]" : "text-ink-soft",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "informar" ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="num-sorteado" className="text-xs font-semibold text-[#3D4A42]">
                  Número sorteado
                </label>
                <input
                  id="num-sorteado"
                  value={num}
                  inputMode="numeric"
                  aria-describedby="num-hint"
                  onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onBlur={() => inRange && who && log(`Nº ${n} informado da live`)}
                  className="tabular h-16 rounded-xl border border-[#DDE6DA] px-4 text-[30px] font-bold tracking-[1px] outline-primary"
                />
                <p id="num-hint" className="text-[11.5px] text-ink-soft">
                  De {raffle.numberFrom} a {raffle.numberTo}. Digite o que saiu no sorteio ao vivo.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3.5">
                <span className="tabular flex size-20 shrink-0 items-center justify-center rounded-full border border-[#DDE6DA] text-[30px] font-bold">
                  {num ? padNumber(n) : "?"}
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={draw}
                    className="h-11 rounded-[11px] border border-[#CFDACB] bg-white px-5 text-[13.5px] font-bold"
                  >
                    {num ? "Sortear de novo" : "Sortear"}
                  </button>
                  <p className="text-[11.5px] text-ink-soft">Sorteia só entre os validados. Cada tentativa fica no histórico.</p>
                </div>
              </div>
            )}

            {who && ok && (
              <OwnerCard entry={who} tone="ok" />
            )}
            {who && !ok && (
              <div className="rounded-xl border border-[#E7D3A6] bg-[#FBF1DC] p-3.5">
                <OwnerCard entry={who} tone="pend" bare />
                <p className="mt-2.5 text-[12.5px] leading-snug text-[#8A5A0F]">
                  Nº {n} é de <strong>{who.name}</strong>, que ainda não cumpriu todas as regras.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenParticipant(who.id)}
                    className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-white text-[12.5px] font-semibold text-ink ring-1 ring-[#E7D3A6]"
                  >
                    Conferir agora
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={disqualify}
                    className="h-10 flex-1 rounded-[10px] border border-[#E7D3A6] bg-white text-[12.5px] font-semibold text-[#B23A22] disabled:opacity-60"
                  >
                    Desclassificar
                  </button>
                </div>
              </div>
            )}
            {num !== "" && !who && (
              <p className="rounded-xl border border-border bg-paper px-3.5 py-3 text-[12.5px] text-ink-soft">
                <strong className="text-ink">
                  {!inRange
                    ? `Esse número está fora da faixa (${raffle.numberFrom} a ${raffle.numberTo}).`
                    : out.has(n)
                      ? "Esse participante foi desclassificado."
                      : `Ninguém escolheu o nº ${n}.`}
                </strong>{" "}
                Informe outro número ou sorteie de novo, como diz o regulamento.
              </p>
            )}

            {hist.length > 0 && (
              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">Histórico desta rodada</h3>
                <ul className="flex flex-col gap-1 text-[12.5px] text-[#3D4A42]">
                  {hist.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="tabular text-ink-soft">{h.at}</span>
                      {h.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="shrink-0 border-t border-[#EEF3EA] px-[22px] py-3.5">
            <button
              type="button"
              onClick={confirm}
              disabled={!ok || pending}
              className={cn(
                "flex h-[46px] w-full items-center justify-center gap-2 rounded-[11px] text-sm font-bold",
                ok ? "bg-primary text-white" : "cursor-not-allowed bg-wash text-ink-soft",
              )}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Confirmar ganhador
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5">
            <div className="flex items-center gap-4 rounded-2xl bg-primary p-[18px] text-white">
              <span className="tabular flex size-[72px] shrink-0 items-center justify-center rounded-full bg-white text-[30px] font-bold text-primary">
                {winnerNum}
              </span>
              <div className="min-w-0">
                <span className="block text-[10.5px] font-bold uppercase tracking-[.5px] text-[#CFE6C2]">Ganhador(a)</span>
                <span className="block truncate text-xl font-bold">{winnerName}</span>
                <span className="block text-[12.5px] text-[#E2F0DA]">Confirmado por {userName} · agora</span>
              </div>
            </div>

            <section>
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">Anunciar</h3>
              <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[#EEF3EA] bg-[#F0F4ED]">
                {AVISOS.map(([k, label, hint]) => (
                  <div key={k} className="flex items-center gap-3 bg-white px-3.5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{label}</span>
                      <span className="block text-[11.5px] text-ink-soft">{hint}</span>
                    </span>
                    <Switch
                      aria-label={label}
                      checked={avisos[k]}
                      onCheckedChange={(on) => setAvisos((a) => ({ ...a, [k]: on }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center">
                <h3 className="flex-1 text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">Texto para o Instagram</h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(igText).then(() => toast.success("Texto copiado."))}
                  className="h-8 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold"
                >
                  Copiar
                </button>
              </div>
              <p className="whitespace-pre-line rounded-xl border border-[#EEF3EA] bg-paper p-3.5 text-[13px] leading-relaxed">{igText}</p>
            </section>
          </div>
          <div className="flex shrink-0 gap-2.5 border-t border-[#EEF3EA] px-[22px] py-3.5">
            <button
              type="button"
              onClick={announce}
              disabled={pending}
              className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[11px] bg-primary text-[13.5px] font-bold text-white disabled:opacity-70"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Publicar resultado
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function OwnerCard({ entry, tone, bare = false }: { entry: RaffleEntry; tone: "ok" | "pend"; bare?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        !bare && "rounded-xl border border-[#DCEAD4] bg-[#F2F8EF] p-3.5",
      )}
    >
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={avatarColors(entry.name)}
      >
        {initials(entry.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{entry.name}</span>
        <span className="block truncate text-[11.5px] text-ink-soft">
          {tone === "ok" ? "Validado" : "A conferir"} · {entry.instagram ? `@${entry.instagram} · ` : ""}
          {formatPhone(entry.phone)}
        </span>
      </span>
    </div>
  );
}
