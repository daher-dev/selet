"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CalendarDays,
  ChevronLeft,
  CircleAlert,
  Loader2,
  LockKeyhole,
  Grid3x3,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  adoptTokenAction,
  pickBonusAction,
  registerAction,
  sendCodeAction,
  startAction,
  verifyCodeAction,
} from "@/actions/raffle-public";
import { NumberPicker } from "@/components/sorteio/number-picker";
import {
  firstName,
  formatDayMonth,
  formatHour,
  maskWhatsapp,
  normalizePhone,
  padNumber,
  type LinkState,
  type PublicEntryView,
  type RegulamentoSection,
} from "@/lib/raffles";
import { cn } from "@/lib/utils";
import { MessageScreen } from "./parts";

export interface PublicRaffleView {
  name: string;
  prize: string;
  location: string;
  drawAt: string;
  signupFrom: string | null;
  numberFrom: number;
  numberTo: number;
  perPerson: number;
  rules: { text: string; type: "obr" | "bonus" }[];
  fields: { instagram: boolean; birthday: boolean; email: boolean };
  winner: { number: number; name: string } | null;
  regulamentoAt: string;
}

interface Props {
  slug: string;
  raffle: PublicRaffleView;
  state: LinkState;
  taken: number[];
  total: number;
  entry: PublicEntryView | null;
  /** ?t= link the server already honoured: remember the device. */
  adoptToken: string | null;
  regulamento: RegulamentoSection[];
  participants: number;
}

type Step =
  | "intro"
  | "wpp"
  | "code"
  | "dup"
  | "dados"
  | "numero"
  | "bonus"
  | "done"
  | "vm-wpp"
  | "vm-code"
  | "regulamento";

const STEP_NUM: Partial<Record<Step, number>> = { wpp: 1, dup: 1, code: 2, dados: 2, numero: 3, bonus: 3, done: 4 };
const STEP_LABELS = ["WhatsApp", "Seus dados", "Número", "Pronto"];
const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  x: `${(i * 61) % 100}%`,
  w: 6 + (i % 3) * 2,
  h: 10 + (i % 4) * 2,
  color: ["#F6EAC6", "#CFE6C2", "#FFFFFF", "#E3A08F", "#9CC5AE"][i % 5],
  d: `${(i % 8) * 0.09}s`,
}));

const handleOf = (text: string) => /@([A-Za-z0-9._]+)/.exec(text)?.[1] ?? null;

const fieldCls = (bad: boolean, done = false) =>
  cn(
    "h-[52px] w-full rounded-xl bg-white px-3.5 text-base text-ink outline-none transition-colors focus-visible:border-primary",
    bad ? "border-[1.5px] border-[#C0492B]" : done ? "border-[1.5px] border-[#9CC5AE]" : "border border-[#DDE6DA]",
  );
const ctaCls = (on = true) =>
  cn(
    "flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] text-base font-bold text-white transition-transform active:scale-[.97]",
    on ? "bg-primary" : "bg-[#8E9A92]",
  );
const LABEL = "flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#3D4A42]";

export function PublicFlow({
  slug,
  raffle,
  state,
  taken: initialTaken,
  total,
  entry: initialEntry,
  adoptToken,
  regulamento,
  participants,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialEntry ? "done" : "intro");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [returnTo, setReturnTo] = useState<Step>("intro");
  const [pending, startTransition] = useTransition();

  const [wpp, setWpp] = useState("");
  const [triedWpp, setTriedWpp] = useState(false);
  const [phoneEnd, setPhoneEnd] = useState("");
  const [known, setKnown] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [resendLeft, setResendLeft] = useState(0);

  const [nome, setNome] = useState("");
  const [ig, setIg] = useState("");
  const [aceite, setAceite] = useState(false);
  const [novidades, setNovidades] = useState(false);
  const [tried, setTried] = useState(false);

  const [taken, setTaken] = useState(initialTaken);
  const [conflict, setConflict] = useState<number | null>(null);
  const [entry, setEntry] = useState<PublicEntryView | null>(initialEntry);
  const [fresh, setFresh] = useState(false);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const free = total - taken.length;
  const obr = raffle.rules.filter((r) => r.type === "obr");
  const bonus = raffle.rules.filter((r) => r.type === "bonus");
  const igHandle = handleOf(raffle.location) ?? handleOf(raffle.rules.map((r) => r.text).join(" "));
  const dateLabel = `${formatDayMonth(raffle.drawAt)}, às ${formatHour(raffle.drawAt)}`;
  const location = raffle.location;

  // Remember this device when the person came in through a private ?t= link.
  useEffect(() => {
    if (!adoptToken) return;
    adoptTokenAction(slug, adoptToken).then(() => router.replace(`/s/${slug}`, { scroll: false }));
  }, [adoptToken, slug, router]);

  // Resend countdown for the WhatsApp code.
  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendLeft]);

  function go(next: Step, back = false) {
    setDir(back ? "back" : "fwd");
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function openRegulamento() {
    setReturnTo(step);
    go("regulamento");
  }

  /* ---------------------------------------------------------------- actions -- */

  function submitWpp(ev: React.FormEvent) {
    ev.preventDefault();
    if (!normalizePhone(wpp)) return setTriedWpp(true);
    startTransition(async () => {
      const res = await startAction(slug, wpp);
      if (!res.ok) return void toast.error(res.error);
      setPhoneEnd(res.phoneEnd);
      setCode("");
      setCodeError("");
      if (res.kind === "new") {
        setKnown(false);
        return go("dados");
      }
      setKnown(true);
      if (res.kind === "dup") return go("dup");
      setResendLeft(res.resendIn);
      go("code");
    });
  }

  function requestCode(to: Step) {
    startTransition(async () => {
      const res = await sendCodeAction(slug, wpp);
      if (!res.ok) return void toast.error(res.error);
      setPhoneEnd(res.phoneEnd);
      setResendLeft(res.resendIn);
      setCode("");
      setCodeError("");
      go(to);
    });
  }

  function onCode(value: string) {
    const c = value.replace(/\D/g, "").slice(0, 6);
    setCode(c);
    setCodeError("");
    if (c.length !== 6) return;
    startTransition(async () => {
      const res = await verifyCodeAction(slug, wpp, c);
      if (!res.ok) {
        setCodeError(res.error);
        return;
      }
      if (res.entry) {
        setEntry(res.entry);
        setFresh(false);
        return go("done");
      }
      if (step === "vm-code" || !res.profile) {
        setCodeError("Esse WhatsApp não participa deste sorteio.");
        return;
      }
      setNome(res.profile.name);
      setIg(res.profile.instagram);
      setNovidades(res.profile.novidades);
      go("dados");
    });
  }

  const raw = {
    nome: nome.trim().length < 2,
    ig: raffle.fields.instagram && ig.trim().length < 2,
    aceite: !aceite,
  };
  const missing = Object.values(raw).filter(Boolean).length;
  const dadosOk = missing === 0;

  function submitDados(ev: React.FormEvent) {
    ev.preventDefault();
    if (!dadosOk) return setTried(true);
    go("numero");
  }

  function confirmNumbers(picks: number[]) {
    startTransition(async () => {
      const res = await registerAction(slug, {
        phone: wpp,
        name: nome,
        instagram: ig,
        novidades,
        aceite: true as const,
        picks,
        website: "",
      });
      if (res.ok) {
        setEntry(res.entry);
        setFresh(true);
        setConflict(null);
        return go("done");
      }
      if (res.taken != null) {
        setTaken((t) => (t.includes(res.taken!) ? t : [...t, res.taken!]));
        setConflict(res.taken);
        return;
      }
      if (res.dup) return go("dup");
      toast.error(res.error);
    });
  }

  function confirmBonus(picks: number[]) {
    startTransition(async () => {
      const res = await pickBonusAction(slug, picks);
      if (res.ok) {
        setEntry(res.entry);
        setConflict(null);
        toast.success("Número registrado.");
        return go("done");
      }
      if (res.taken != null) {
        setTaken((t) => (t.includes(res.taken!) ? t : [...t, res.taken!]));
        setConflict(res.taken);
        return;
      }
      toast.error(res.error);
    });
  }

  /* ---------------------------------------------------------------- screens -- */

  const shell = (children: React.ReactNode, animate = true) => (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-[#F6FAF4] text-ink sm:shadow-[0_0_0_1px_#D6E2D0]">
      {STEP_NUM[step] && step !== "done" && (
        <StepBar
          current={STEP_NUM[step]!}
          onBack={() => {
            if (step === "bonus") return go("done", true);
            if (step === "dados" && known) return go("wpp", true);
            const prev: Partial<Record<Step, Step>> = {
              wpp: "intro",
              dup: "wpp",
              code: "wpp",
              dados: "wpp",
              numero: "dados",
            };
            go(prev[step] ?? "intro", true);
          }}
        />
      )}
      <div
        key={step}
        className={cn("flex min-h-0 flex-1 flex-col", animate && (dir === "fwd" ? "sorteio-fwd" : "sorteio-back"))}
      >
        {children}
      </div>
    </main>
  );

  if (step === "regulamento") {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-white sm:shadow-[0_0_0_1px_#D6E2D0]">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-[18px] py-3.5">
          <button
            type="button"
            onClick={() => go(returnTo, true)}
            aria-label="Voltar ao sorteio"
            className="-ml-2 flex size-11 items-center justify-center rounded-[10px]"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-base font-bold">Regulamento</span>
        </div>
        <article className="flex-1 overflow-y-auto px-5 pb-7 pt-[18px] text-[13.5px] leading-relaxed text-[#3D4A42]">
          <p className="text-xs text-ink-soft">
            {raffle.name} · versão de {new Date(raffle.regulamentoAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </p>
          {regulamento.map((s) => (
            <section key={s.title}>
              <h2 className="mb-1 mt-[18px] text-sm font-bold text-ink">{s.title}</h2>
              {s.lines.length > 1 && s.title === "Como participar" ? (
                <ul className="list-disc space-y-1 pl-[18px]">
                  {s.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                s.lines.map((l) => (
                  <p key={l} className="mt-1.5 first:mt-0">
                    {l}
                  </p>
                ))
              )}
            </section>
          ))}
        </article>
      </main>
    );
  }

  const closedActions = (primary: "seguir" | "ver") => {
    const seguir = igHandle ? { label: `Seguir @${igHandle}`, href: `https://instagram.com/${igHandle}` } : null;
    const ver = { label: "Ver meus números", onClick: () => go("vm-wpp") };
    const reg = { label: "Regulamento", onClick: openRegulamento };
    return primary === "ver" ? [ver, reg] : [seguir ?? reg, reg].filter((a, i, l) => l.indexOf(a) === i);
  };

  // 10a — "Ver meus números" (from the closed-link screens)
  if (step === "vm-wpp" || step === "vm-code") {
    return shell(
      <>
        <Header onBack={() => go(step === "vm-code" ? "vm-wpp" : "intro", true)} />
        {step === "vm-wpp" ? (
          <form
            className="flex flex-1 flex-col gap-3.5 px-[18px] pb-6 pt-2.5"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!normalizePhone(wpp)) return setTriedWpp(true);
              requestCode("vm-code");
            }}
            noValidate
          >
            <h1 className="mt-2.5 text-[22px] font-bold">Ver meus números</h1>
            <p className="text-sm leading-normal text-[#3D4A42]">
              Use o WhatsApp do cadastro. Mandamos um código de 6 dígitos para confirmar que é você.
            </p>
            <label className={LABEL}>
              WhatsApp
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={wpp}
                placeholder="(27) 9 0000-0000"
                aria-invalid={triedWpp && !normalizePhone(wpp)}
                onChange={(e) => setWpp(maskWhatsapp(e.target.value))}
                className={fieldCls(triedWpp && !normalizePhone(wpp))}
              />
              {triedWpp && !normalizePhone(wpp) && (
                <span className="text-xs text-[#B23A22]">DDD + 9 dígitos, como (27) 9 9912-4432.</span>
              )}
            </label>
            <button type="submit" disabled={pending} className={ctaCls()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Enviar código
            </button>
            <p className="text-xs leading-normal text-ink-soft">
              Se esse WhatsApp estiver no sorteio, o código chega em instantes. Por segurança, não dizemos aqui se ele está ou não cadastrado.
            </p>
          </form>
        ) : (
          <CodeStep
            title="Digite o código"
            intro={<>Enviado para o WhatsApp terminado em <strong className="font-bold">{phoneEnd}</strong>.</>}
            code={code}
            error={codeError}
            pending={pending}
            resendLeft={resendLeft}
            onChange={onCode}
            onResend={() => requestCode("vm-code")}
            onSwap={() => go("vm-wpp", true)}
          />
        )}
      </>,
    );
  }

  if (state === "resultado" && raffle.winner) {
    return (
      <ResultScreen
        raffle={raffle}
        winner={raffle.winner}
        entry={entry}
        taken={taken.length}
        participants={participants}
        igHandle={igHandle}
        onRegulamento={openRegulamento}
      />
    );
  }

  // Closed / sold-out / not-yet-open / result screens (visitor without an entry on this device)
  if (!entry || step === "intro") {
    if (state === "naoAbriu") {
      return (
        <MessageScreen
          eyebrow={raffle.name}
          icon={CalendarDays}
          tone="blue"
          title={`Inscrições abrem ${raffle.signupFrom ? `${formatDayMonth(raffle.signupFrom)}, às ${formatHour(raffle.signupFrom)}` : "em breve"}`}
          text={`Volte por este mesmo link. Prêmio: ${raffle.prize}, sorteado em ${formatDayMonth(raffle.drawAt)}.`}
          actions={closedActions("seguir")}
        />
      );
    }
    if (state === "encerrado") {
      return (
        <MessageScreen
          eyebrow={raffle.name}
          icon={LockKeyhole}
          tone="amber"
          title="Inscrições encerradas"
          text={`O sorteio é ${formatDayMonth(raffle.drawAt)}, às ${formatHour(raffle.drawAt)}${location ? `, ${location.charAt(0).toLowerCase()}${location.slice(1)}` : ""}. Se você participou, seus números continuam valendo.`}
          actions={closedActions("ver")}
        />
      );
    }
    if (state === "esgotado") {
      return (
        <MessageScreen
          eyebrow={raffle.name}
          icon={Grid3x3}
          tone="red"
          title={`Os ${total} números já têm dono`}
          text="Não dá mais para entrar neste sorteio. Os próximos saem primeiro no Instagram da loja."
          actions={[
            ...(igHandle ? [{ label: `Seguir @${igHandle}`, href: `https://instagram.com/${igHandle}` }] : []),
            { label: "Já participa? Ver meus números", onClick: () => go("vm-wpp") },
          ]}
        />
      );
    }
  }

  // Step 0 — intro (board 4d, first screen)
  if (step === "intro") {
    const items: { n: string; text: string; bonus: boolean }[] = [
      { n: "1", text: "Seu WhatsApp (se já for cliente, a gente preenche o resto)", bonus: false },
      {
        n: "2",
        text:
          raffle.perPerson > 1
            ? `Escolha seus ${raffle.perPerson} números da sorte de ${raffle.numberFrom} a ${raffle.numberTo}`
            : `Escolha seu número da sorte de ${raffle.numberFrom} a ${raffle.numberTo}`,
        bonus: false,
      },
      ...obr.map((r, i) => ({ n: String(3 + i), text: r.text, bonus: false })),
      ...bonus.map((r) => ({ n: "+", text: `Bônus: ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)} e ganhe mais 1 número`, bonus: true })),
    ];
    return shell(
      <>
        <div className="shrink-0 bg-primary px-[22px] pb-14 pt-[26px] text-white">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[30px] font-semibold leading-none">Selet</span>
            <span className="text-[10px] font-semibold uppercase tracking-[2.5px] text-[#CFE6C2]">Sorteio</span>
          </div>
          <p className="mt-6 text-[15px] text-[#CFE6C2]">{raffle.name}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-[1.05] tracking-[-.6px]">Concorra a {raffle.prize}</h1>
        </div>
        <div className="relative z-10 -mt-9 mx-4 flex shrink-0 items-center gap-3 rounded-[14px] border border-border bg-white px-4 py-3.5 shadow-[0_12px_30px_-18px_rgba(21,60,40,.4)]">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{dateLabel}</span>
            {location && <span className="block text-[12.5px] text-ink-soft">{location}</span>}
          </span>
          <span
            title={`${free} de ${total} números livres`}
            className="shrink-0 whitespace-nowrap rounded-full bg-[#E7F4EC] px-2.5 text-xs font-bold leading-[26px] text-[#2E7D4A]"
          >
            {free} livres
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-[22px]">
          <h2 className="mb-2.5 text-base font-bold">Leva menos de 1 minuto</h2>
          <ol className="flex flex-col gap-2">
            {items.map((i) => (
              <li
                key={i.n + i.text}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-[13.5px]",
                  i.bonus ? "border-[#F0E4C8] bg-[#FBF6EC]" : "border-border bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    i.bonus ? "bg-[#F6EAC6] text-[#8A6312]" : "bg-[#E7F4EC] text-primary",
                  )}
                >
                  {i.n}
                </span>
                <span>{i.text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="shrink-0 px-4 pb-5 pt-3">
          <button
            type="button"
            onClick={() => go("wpp")}
            className={cn(ctaCls(), "shadow-[0_10px_24px_-12px_rgba(24,107,65,.9)]")}
          >
            Quero participar
            <ArrowRight className="size-[18px]" />
          </button>
          <p className="mt-1.5 text-center text-xs text-ink-soft">
            <button type="button" onClick={openRegulamento} className="h-9 font-semibold text-primary">
              Regulamento
            </button>
          </p>
        </div>
      </>,
      false,
    );
  }

  if (step === "wpp") {
    return shell(
      <form onSubmit={submitWpp} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-3 pt-[22px]">
          <h1 className="text-2xl font-bold">Qual o seu WhatsApp?</h1>
          <p className="text-sm leading-normal text-[#3D4A42]">
            Se você já é cliente da Selet, a gente preenche o resto pra você.
          </p>
          <label className={LABEL}>
            WhatsApp
            <input
              value={wpp}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="(27) 9 0000-0000"
              aria-invalid={triedWpp && !normalizePhone(wpp)}
              onChange={(e) => setWpp(maskWhatsapp(e.target.value))}
              className={fieldCls(triedWpp && !normalizePhone(wpp), !!normalizePhone(wpp))}
            />
            {triedWpp && !normalizePhone(wpp) && (
              <span className="text-xs text-[#B23A22]">
                {wpp ? "Número incompleto: " : ""}DDD + 9 dígitos, como (27) 9 9912-4432.
              </span>
            )}
          </label>
        </div>
        <div className="shrink-0 border-t border-border bg-white px-4 pb-5 pt-3">
          <button type="submit" disabled={pending} className={ctaCls(!(triedWpp && !normalizePhone(wpp)))}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continuar
          </button>
          <p className="mt-2.5 text-center text-xs text-ink-soft">
            Já escolheu seu número? É só continuar, a gente te mostra.
          </p>
        </div>
      </form>,
    );
  }

  if (step === "dup") {
    return shell(
      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-6 pt-[22px]">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#FBF1DC] text-[#8A5A0F]">
          <MessageCircle className="size-7" strokeWidth={1.8} />
        </span>
        <h1 className="mt-[18px] text-2xl font-bold leading-tight">Esse WhatsApp já está no sorteio</h1>
        <p className="mt-2 text-[14.5px] leading-normal text-[#3D4A42]">
          O {wpp} já tem número escolhido. Para ver qual é, mandamos um código pelo WhatsApp.
        </p>
        <div className="flex-1" />
        <button type="button" disabled={pending} onClick={() => requestCode("code")} className={ctaCls()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Receber código no WhatsApp
        </button>
        <button
          type="button"
          onClick={() => {
            setWpp("");
            go("wpp", true);
          }}
          className="mt-1.5 h-11 text-[13.5px] font-semibold text-primary"
        >
          Usar outro WhatsApp
        </button>
        <p className="mt-2 text-xs leading-normal text-ink-soft">
          Cada WhatsApp participa uma vez por sorteio. Não mostramos o número nem o nome antes do código, para ninguém ver o cadastro de outra pessoa.
        </p>
      </div>,
    );
  }

  if (step === "code") {
    return shell(
      <CodeStep
        title="Que bom te ver de novo!"
        intro={
          <>
            Mandamos um código de 6 dígitos para o WhatsApp terminado em <strong className="font-bold">{phoneEnd}</strong>. Com ele a gente carrega seu cadastro.
          </>
        }
        code={code}
        error={codeError}
        pending={pending}
        resendLeft={resendLeft}
        onChange={onCode}
        onResend={() => requestCode("code")}
        onSwap={() => {
          setWpp("");
          go("wpp", true);
        }}
        footnote="Pedimos o código para ninguém ver seus dados só digitando o seu número."
      />,
    );
  }

  if (step === "dados") {
    const returning = known;
    return shell(
      <form onSubmit={submitDados} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-3 pt-[22px]">
          {returning ? (
            <>
              <h1 className="text-2xl font-bold">Oi, {firstName(nome)}! Tá tudo certo?</h1>
              <div className="flex flex-col gap-px overflow-hidden rounded-[14px] border border-border bg-wash">
                <div className="flex items-center gap-2.5 bg-white px-3.5 py-3">
                  <span className="w-[84px] text-xs text-ink-soft">Nome</span>
                  <span className="flex-1 text-sm font-semibold">{nome}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-white px-3.5 py-3">
                  <span className="w-[84px] text-xs text-ink-soft">WhatsApp</span>
                  <span className="flex-1 text-sm font-semibold">{wpp}</span>
                </div>
                {raffle.fields.instagram && (
                  <label className="flex items-center gap-2.5 bg-white py-1.5 pl-3.5 pr-2.5">
                    <span className="w-[84px] text-xs text-ink-soft">Instagram</span>
                    <span className="flex h-10 flex-1 items-center overflow-hidden rounded-[10px] border border-[#DDE6DA]">
                      <span className="pl-2.5 pr-0.5 text-sm text-ink-soft">@</span>
                      <input
                        value={ig}
                        aria-label="Instagram"
                        autoCapitalize="none"
                        onChange={(e) => setIg(e.target.value.replace(/^@/, "").replace(/\s/g, ""))}
                        className="h-full min-w-0 flex-1 pr-2.5 text-sm font-semibold outline-none"
                      />
                    </span>
                  </label>
                )}
              </div>
              {raffle.fields.instagram && (
                <p className="text-xs text-ink-soft">Confira o Instagram: é por ele que a loja confere as regras.</p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Prazer! Conta um pouco de você</h1>
              <div className="flex items-center gap-2 text-[13px] text-[#3D4A42]">
                <span className="font-semibold">{wpp}</span>
                <button type="button" onClick={() => go("wpp", true)} className="h-8 px-2 text-[12.5px] font-semibold text-primary">
                  Trocar
                </button>
              </div>
              <label className={LABEL}>
                Nome
                <input
                  value={nome}
                  autoComplete="name"
                  placeholder="Como você se chama"
                  aria-invalid={tried && raw.nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={fieldCls(tried && raw.nome, !raw.nome)}
                />
                {tried && raw.nome && (
                  <span className="text-xs text-[#B23A22]">Conte seu nome para a gente te chamar se ganhar.</span>
                )}
              </label>
              {raffle.fields.instagram && (
                <label className={LABEL}>
                  Instagram
                  <span className={cn(fieldCls(tried && raw.ig, !raw.ig), "flex items-center overflow-hidden px-0")}>
                    <span className="pl-3.5 pr-0.5 text-[15px] text-ink-soft">@</span>
                    <input
                      value={ig}
                      autoCapitalize="none"
                      placeholder="seuperfil"
                      aria-invalid={tried && raw.ig}
                      onChange={(e) => setIg(e.target.value.replace(/^@/, "").replace(/\s/g, ""))}
                      className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-[15px] outline-none"
                    />
                  </span>
                  <span className={cn("text-[11.5px] font-medium", tried && raw.ig ? "text-[#B23A22]" : "text-ink-soft")}>
                    {tried && raw.ig
                      ? "Precisamos do seu @ para conferir as regras."
                      : "É por ele que a gente confere as regras."}
                  </span>
                </label>
              )}
            </>
          )}

          <label
            className={cn(
              "flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-[12.5px] leading-snug text-[#3D4A42]",
              tried && raw.aceite ? "sorteio-shake border-[1.5px] border-[#C0492B]" : "border-border",
            )}
          >
            <input
              type="checkbox"
              checked={aceite}
              aria-invalid={tried && raw.aceite}
              onChange={(e) => setAceite(e.target.checked)}
              className="mt-px size-5 shrink-0 accent-[#186B41]"
            />
            <span>
              Li e aceito o{" "}
              <button type="button" onClick={openRegulamento} className="font-semibold text-primary underline-offset-2 hover:underline">
                regulamento
              </button>
              {returning ? " deste sorteio" : ""}, e autorizo a Selet a me contatar pelo WhatsApp sobre {returning ? "ele" : "este sorteio"}.
              {tried && raw.aceite && (
                <span className="mt-0.5 block font-semibold text-[#B23A22]">Obrigatório para participar.</span>
              )}
            </span>
          </label>
          {!returning && (
            <label className="flex items-start gap-2.5 px-0.5 text-[12.5px] leading-snug text-[#3D4A42]">
              <input
                type="checkbox"
                checked={novidades}
                onChange={(e) => setNovidades(e.target.checked)}
                className="mt-px size-5 shrink-0 accent-[#186B41]"
              />
              <span>
                Quero receber novidades e promoções da Selet. <span className="text-ink-soft">(opcional)</span>
              </span>
            </label>
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-white px-4 pb-5 pt-3">
          <button type="submit" className={ctaCls(dadosOk || !tried)}>
            {dadosOk || !tried ? "Escolher meu número" : `Falta ${missing} ${missing > 1 ? "campos" : "campo"}`}
          </button>
        </div>
      </form>,
    );
  }

  if (step === "numero") {
    return shell(
      <NumberPicker
        mode="cadastro"
        embedded
        from={raffle.numberFrom}
        to={raffle.numberTo}
        taken={taken}
        quantos={raffle.perPerson}
        conflict={conflict}
        pending={pending}
        title={`${firstName(nome)}, escolha ${raffle.perPerson > 1 ? `seus ${raffle.perPerson} números` : "seu número"} da sorte`}
        onConfirm={confirmNumbers}
      />,
    );
  }

  if (step === "bonus" && entry) {
    return shell(
      <NumberPicker
        mode="bonus"
        from={raffle.numberFrom}
        to={raffle.numberTo}
        taken={taken}
        own={entry.numbers.map((n) => n.n)}
        quantos={Math.max(1, entry.pendingSlots)}
        conflict={conflict}
        pending={pending}
        title={`${firstName(entry.name)}, escolha seu número bônus`}
        onBack={() => go("done", true)}
        onConfirm={confirmBonus}
      />,
    );
  }

  // Step 4 — confirmation (also the "my numbers" screen)
  if (entry) {
    const main = entry.numbers[0]?.n;
    const hasMore = entry.numbers.length > 1;
    const stillOpen = state === "aberto" || state === "encerrado" || state === "naoAbriu" || state === "esgotado";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-[#F6FAF4] text-ink sm:shadow-[0_0_0_1px_#D6E2D0]">
        {step === "done" && (
          <div className="sorteio-fwd flex flex-col">
            <div className="relative flex flex-col items-center overflow-hidden bg-primary px-[22px] pb-[26px] pt-[22px] text-center text-white">
              {fresh &&
                CONFETTI.map((c, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="sorteio-fall absolute top-0 rounded-sm"
                    style={{ left: c.x, width: c.w, height: c.h, background: c.color, animationDelay: c.d }}
                  />
                ))}
              <span className="relative font-display text-[26px] font-semibold leading-none">Selet</span>
              <span className="relative mt-[22px] flex size-28 items-center justify-center">
                {fresh && <span aria-hidden="true" className="sorteio-ring absolute inset-0 rounded-full border-[3px] border-[#CFE6C2]" />}
                <span className="sorteio-pop tabular relative flex size-28 items-center justify-center rounded-full bg-white text-[46px] font-bold tracking-[-1px] text-primary shadow-[0_0_0_8px_rgba(255,255,255,.16)]">
                  {main != null ? padNumber(main) : "—"}
                </span>
              </span>
              <h1 className="relative mt-4 text-[22px] font-bold">
                {hasMore
                  ? `Seus números, ${firstName(entry.name)}!`
                  : `Número ${main != null ? padNumber(main) : ""} é seu, ${firstName(entry.name)}!`}
              </h1>
              {hasMore && (
                <p className="relative mt-2 flex flex-wrap justify-center gap-1.5">
                  {entry.numbers.map((n) => (
                    <span key={n.n} className="tabular rounded-full bg-white/15 px-3 py-0.5 text-sm font-bold">
                      {padNumber(n.n)}
                    </span>
                  ))}
                </p>
              )}
              <p className="relative mt-1.5 text-[13.5px] leading-snug text-[#E2F0DA]">
                Sorteio {formatDayMonth(raffle.drawAt)} às {formatHour(raffle.drawAt)}
                {location ? `, ${location.charAt(0).toLowerCase()}${location.slice(1)}` : ""}. O resultado chega no seu WhatsApp.
              </p>
            </div>

            <div className="flex flex-col gap-3.5 px-4 pb-6 pt-[18px]">
              {entry.pendingSlots > 0 && stillOpen && (
                <section className="rounded-[14px] border border-[#F0E4C8] bg-[#FBF6EC] px-4 py-3.5">
                  <span className="block text-[14.5px] font-bold">
                    Você ganhou +{entry.pendingSlots} número{entry.pendingSlots > 1 ? "s" : ""}!
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6B5320]">
                    A loja conferiu e liberou. Escolha agora.
                  </span>
                  <button
                    type="button"
                    onClick={() => go("bonus")}
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white"
                  >
                    Escolher meu número bônus
                  </button>
                </section>
              )}

              {entry.missing.length > 0 && (
                <section className="rounded-[14px] border border-border bg-white px-4 py-3.5">
                  <h2 className="text-[15px] font-bold">Para valer, falta só isso</h2>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {entry.missing.map((text, i) => {
                      const h = handleOf(text) ?? igHandle;
                      const on = !!done[i];
                      return (
                        <li key={text} className="flex items-center gap-2.5 text-[13.5px]">
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={`Marcar: ${text}`}
                            onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full transition-all",
                              on ? "bg-primary text-white" : "border-[1.5px] border-dashed border-[#C9D3CB] bg-white text-transparent",
                            )}
                          >
                            <Check className="size-4" strokeWidth={3} />
                          </button>
                          <span className={cn("flex-1", on && "text-ink-soft line-through")}>{text}</span>
                          <a
                            href={`https://instagram.com${h ? `/${h}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-9 items-center rounded-[9px] border border-border px-3 text-[12.5px] font-semibold text-primary"
                          >
                            Abrir
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 text-[11.5px] text-ink-soft">
                    É um lembrete para você; a loja confere pelo @{entry.instagram || "seu perfil"}.
                  </p>
                </section>
              )}

              {entry.missing.length === 0 && entry.status === "ok" && (
                <p className="rounded-[14px] border border-[#DCEAD4] bg-[#F2F8EF] px-4 py-3 text-[13px] text-[#37543F]">
                  Tudo certo: a loja já conferiu suas regras. Boa sorte!
                </p>
              )}

              {bonus.length > 0 && state === "aberto" && (
                <section className="rounded-[14px] border border-[#F0E4C8] bg-[#FBF6EC] px-4 py-3.5">
                  <span className="block text-[14.5px] font-bold">Ganhe mais um número</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6B5320]">
                    {bonus[0].text}. Quando a loja conferir, você recebe o link pra escolher.
                  </span>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Participe do sorteio "${raffle.name}": ${typeof window !== "undefined" ? window.location.origin : ""}/s/${slug}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(ctaCls(), "mt-3 h-12 rounded-xl text-sm")}
                  >
                    <MessageCircle className="size-4" />
                    Convidar pelo WhatsApp
                  </a>
                </section>
              )}

              <p className="text-center text-xs leading-normal text-ink-soft">
                Abra este mesmo link quando quiser para ver seus números.{" "}
                <button type="button" onClick={openRegulamento} className="font-semibold text-primary">
                  Regulamento
                </button>
              </p>
            </div>
          </div>
        )}
      </main>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ pieces -- */

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-white px-[18px] py-3.5">
      <button type="button" onClick={onBack} aria-label="Voltar" className="-ml-2 flex size-11 items-center justify-center rounded-[10px]">
        <ChevronLeft className="size-5" />
      </button>
      <span className="font-display text-2xl font-semibold leading-none text-primary">Selet</span>
    </div>
  );
}

function StepBar({ current, onBack }: { current: number; onBack: () => void }) {
  return (
    <div className="shrink-0 border-b border-border bg-white px-4 pb-3 pt-2.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Voltar" className="-ml-2.5 flex size-11 items-center justify-center rounded-[10px]">
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display text-2xl font-semibold leading-none text-primary">Selet</span>
        <span className="flex-1" />
        <span className="text-xs font-semibold text-ink-soft">Passo {current} de 4</span>
      </div>
      <ol aria-label="Progresso" className="mt-2 grid grid-cols-4 gap-1.5">
        {STEP_LABELS.map((label, i) => (
          <li key={label} aria-current={i + 1 === current ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className="block h-[5px] overflow-hidden rounded bg-[#E4ECE1]">
              <span
                className="block h-full rounded bg-primary transition-[width] duration-500"
                style={{ width: i + 1 < current ? "100%" : i + 1 === current ? "50%" : "0%" }}
              />
            </span>
            <span className={cn("text-[11.5px]", i + 1 === current ? "font-bold text-ink" : i + 1 < current ? "font-medium text-ink" : "font-medium text-ink-soft")}>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CodeStep({
  title,
  intro,
  code,
  error,
  pending,
  resendLeft,
  onChange,
  onResend,
  onSwap,
  footnote,
}: {
  title: string;
  intro: React.ReactNode;
  code: string;
  error: string;
  pending: boolean;
  resendLeft: number;
  onChange: (v: string) => void;
  onResend: () => void;
  onSwap: () => void;
  footnote?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-6 pt-[22px]">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm leading-normal text-[#3D4A42]">{intro}</p>
      <label className="flex flex-col gap-2 text-[12.5px] font-semibold text-[#3D4A42]">
        Código
        <input
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="······"
          autoFocus
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "tabular h-[62px] rounded-xl bg-white px-[18px] text-[28px] font-bold tracking-[12px] text-ink outline-none",
            error ? "border-[1.5px] border-[#C0492B]" : "border-[1.5px] border-primary",
          )}
        />
        {error ? (
          <span role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-[#B23A22]">
            <CircleAlert className="size-3.5" />
            {error}
          </span>
        ) : (
          <span className="text-[11.5px] font-medium text-ink-soft">Confere sozinho quando você digitar o 6º dígito.</span>
        )}
      </label>
      {pending && (
        <span className="flex items-center gap-2 text-xs text-ink-soft">
          <Loader2 className="size-3.5 animate-spin" />
          Conferindo…
        </span>
      )}
      <div className="flex items-center justify-between text-[13px]">
        {resendLeft > 0 ? (
          <span className="tabular text-ink-soft">
            Reenviar em {Math.floor(resendLeft / 60)}:{String(resendLeft % 60).padStart(2, "0")}
          </span>
        ) : (
          <button type="button" onClick={onResend} className="h-11 font-semibold text-primary">
            Reenviar código
          </button>
        )}
        <button type="button" onClick={onSwap} className="h-11 text-[13px] font-semibold text-primary">
          Não é você? Trocar
        </button>
      </div>
      <p className="mt-auto text-xs leading-normal text-ink-soft">
        {footnote ?? "O código vale 10 minutos. Depois de confirmar, este aparelho lembra de você até o fim do sorteio."}
      </p>
    </div>
  );
}

function ResultScreen({
  raffle,
  winner,
  entry,
  taken,
  participants,
  igHandle,
  onRegulamento,
}: {
  raffle: PublicRaffleView;
  winner: { number: number; name: string };
  entry: PublicEntryView | null;
  taken: number;
  participants: number;
  igHandle: string | null;
  onRegulamento: () => void;
}) {
  const won = !!entry?.numbers.some((n) => n.n === winner.number);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#F6FAF4] text-ink sm:shadow-[0_0_0_1px_#D6E2D0]">
      <div className="flex flex-col items-center bg-primary px-[22px] pb-[30px] pt-[26px] text-center text-white">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[26px] font-semibold leading-none">Selet</span>
          <span className="text-[10px] font-semibold uppercase tracking-[2.5px] text-[#CFE6C2]">Resultado</span>
        </div>
        <p className="mt-[18px] text-sm text-[#E2F0DA]">
          {raffle.name} · sorteado em {formatDayMonth(raffle.drawAt)}, {formatHour(raffle.drawAt)}
        </p>
        <span className="tabular mt-4 flex size-[124px] items-center justify-center rounded-full bg-white text-[50px] font-bold tracking-[-1px] text-primary shadow-[0_0_0_8px_rgba(255,255,255,.16)]">
          {padNumber(winner.number)}
        </span>
        <h1 className="mt-4 text-2xl font-bold">{winner.name} ganhou!</h1>
        <p className="mt-1 text-[13.5px] text-[#E2F0DA]">Prêmio: {raffle.prize}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-4 pb-6 pt-5">
        {entry && (
          <section className="rounded-[14px] border border-border bg-white px-4 py-3.5">
            <h2 className="text-[15px] font-bold">Seus números</h2>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="flex flex-wrap gap-1.5">
                {entry.numbers.map((n) => (
                  <span
                    key={n.n}
                    className="tabular inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-[#DCEAD4] bg-[#F2F8EF] px-2 text-[15px] font-bold text-primary"
                  >
                    {padNumber(n.n)}
                  </span>
                ))}
              </span>
              <span className="text-[13px] leading-snug text-[#3D4A42]">
                {won ? `Parabéns, ${firstName(entry.name)}! A loja vai falar com você.` : `Não foi dessa vez, ${firstName(entry.name)}. Obrigado por participar!`}
              </span>
            </div>
            <p className="mt-2.5 text-[11.5px] text-ink-soft">Só você vê esta parte, neste aparelho.</p>
          </section>
        )}
        <section className="rounded-[14px] border border-[#F0E4C8] bg-[#FBF6EC] px-4 py-3.5">
          <h2 className="text-[15px] font-bold">Quer saber do próximo?</h2>
          <p className="mb-3 mt-1 text-[13px] leading-snug text-[#6B5320]">Os sorteios saem primeiro no Instagram da loja.</p>
          <a
            href={`https://instagram.com${igHandle ? `/${igHandle}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-[46px] items-center justify-center rounded-xl bg-primary text-sm font-bold text-white"
          >
            {igHandle ? `Seguir @${igHandle}` : "Ir para o Instagram"}
          </a>
        </section>
        <p className="mt-auto text-center text-xs text-ink-soft">
          <button type="button" onClick={onRegulamento} className="font-semibold text-primary">
            Regulamento
          </button>{" "}
          · {participants} participantes · {taken} números
        </p>
      </div>
    </main>
  );
}
