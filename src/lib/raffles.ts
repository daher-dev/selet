/**
 * Sorteios (raffles): serialized types + pure rules shared by the admin UI,
 * the public link and the `server-only` data layer. Dates are ISO strings.
 */
import { zonedParts } from "./timezone";

export type RaffleStatus = "rascunho" | "aberto" | "encerrado" | "sorteado";
export type RuleType = "obr" | "bonus";
export type EntryStatus = "pend" | "ok" | "excl";
export type NumberKind = "cadastro" | "bonus" | "extra";
export type LeadKind = "novo" | "vinc" | "cli";

export interface RaffleRule {
  id: string;
  text: string;
  type: RuleType;
}

export interface RaffleFields {
  instagram: boolean;
  birthday: boolean;
  email: boolean;
}

export interface DrawLogEntry {
  at: string;
  text: string;
}

export interface RaffleWinner {
  number: number;
  entryId: string;
  name: string;
}

export interface Raffle {
  id: string;
  name: string;
  prize: string;
  /** "Ao vivo no Instagram @selet.vv" — shown on the link, card and regulamento. */
  location: string;
  /** "Retirada na loja em até 30 dias" */
  pickup: string;
  /** Free text appended to the generated regulamento. */
  notes: string;
  slug: string;
  status: RaffleStatus;
  /** null = open as soon as published */
  signupFrom: string | null;
  signupUntil: string;
  drawAt: string;
  numberFrom: number;
  numberTo: number;
  perPerson: number;
  rules: RaffleRule[];
  fields: RaffleFields;
  draws: DrawLogEntry[];
  winner: RaffleWinner | null;
  /** The result is visible on the public link. */
  showResult: boolean;
  publishedAt: string | null;
  regulamentoAt: string;
  createdAt: string;
}

export interface EntryNumber {
  n: number;
  kind: NumberKind;
  ruleId?: string;
  reason?: string;
  by?: string;
  at: string;
}

/** A number the person is owed but has not chosen yet. */
export interface EntrySlot {
  kind: "bonus" | "extra";
  ruleId?: string;
  reason?: string;
  by?: string;
  at: string;
}

export interface WaivedRule {
  by: string;
  at: string;
  reason: string;
}

export interface RaffleEntry {
  id: string;
  raffleId: string;
  name: string;
  /** digits only, DDD + 9 digits */
  phone: string;
  instagram: string;
  email?: string;
  birthday?: { day: number; month: number };
  novidades: boolean;
  createdAt: string;
  checks: Record<string, boolean>;
  waived: Record<string, WaivedRule>;
  status: EntryStatus;
  exclReason?: string;
  numbers: EntryNumber[];
  slots: EntrySlot[];
  customerId: string | null;
  /** Secret that identifies the person on this raffle (cookie / ?t= link). */
  token: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  instagram: string;
  email?: string;
  novidades: boolean;
  raffleIds: string[];
  raffleNames: string[];
  createdAt: string;
  lastAt: string;
  kind: LeadKind;
  customerId: string | null;
}

export const MAX_PER_PERSON = 10;

// ---------------------------------------------------------------- phone ---

/** Digits only; drops a leading 55. Returns null unless DDD + 9 digits. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if ((d.length === 13 || d.length === 12) && d.startsWith("55")) d = d.slice(2);
  return d.length === 11 && d[2] === "9" ? d : null;
}

/** "(27) 9 9912-4432" while typing (public form). */
export function maskWhatsapp(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/** "(27) 99912-4432" from stored digits (same style as Clientes). */
export function formatPhone(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// -------------------------------------------------------------- numbers ---

export function padNumber(n: number): string {
  return String(n).padStart(2, "0");
}

export function totalNumbers(r: Pick<Raffle, "numberFrom" | "numberTo">): number {
  return r.numberTo - r.numberFrom + 1;
}

/** "Maria Almeida Souza" → "Maria S." (public result). */
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

// ---------------------------------------------------------------- rules ---

export function obligatoryRules(rules: RaffleRule[]): RaffleRule[] {
  return rules.filter((r) => r.type === "obr");
}

export function ruleDone(
  entry: Pick<RaffleEntry, "checks" | "waived">,
  ruleId: string,
): boolean {
  return !!entry.checks[ruleId] || !!entry.waived[ruleId];
}

export function missingRules(
  rules: RaffleRule[],
  entry: Pick<RaffleEntry, "checks" | "waived">,
): RaffleRule[] {
  return obligatoryRules(rules).filter((r) => !ruleDone(entry, r.id));
}

export function deriveStatus(
  rules: RaffleRule[],
  entry: Pick<RaffleEntry, "checks" | "waived" | "exclReason" | "status">,
): EntryStatus {
  if (entry.status === "excl") return "excl";
  return missingRules(rules, entry).length === 0 ? "ok" : "pend";
}

/** Bonus rules checked by the team that still owe the person a number. */
export function missingBonusSlots(
  rules: RaffleRule[],
  entry: Pick<RaffleEntry, "checks" | "numbers" | "slots">,
): RaffleRule[] {
  return rules.filter(
    (r) =>
      r.type === "bonus" &&
      entry.checks[r.id] &&
      !entry.numbers.some((n) => n.ruleId === r.id) &&
      !entry.slots.some((s) => s.ruleId === r.id),
  );
}

// ----------------------------------------------------------- link state ---

export type LinkState =
  | "aberto"
  | "naoAbriu"
  | "encerrado"
  | "esgotado"
  | "resultado"
  | "indisponivel";

export function linkState(
  raffle: Pick<
    Raffle,
    "status" | "signupFrom" | "signupUntil" | "showResult" | "winner"
  >,
  freeCount: number,
  now: Date = new Date(),
): LinkState {
  if (raffle.status === "rascunho") return "indisponivel";
  if (raffle.status === "sorteado") {
    return raffle.showResult && raffle.winner ? "resultado" : "encerrado";
  }
  if (raffle.status === "encerrado") return "encerrado";
  if (now > new Date(raffle.signupUntil)) return "encerrado";
  if (raffle.signupFrom && now < new Date(raffle.signupFrom)) return "naoAbriu";
  if (freeCount <= 0) return "esgotado";
  return "aberto";
}

// ------------------------------------------------------------ validation ---

export interface RaffleDraftInput {
  name: string;
  numberFrom: number;
  numberTo: number;
  perPerson: number;
  rules: RaffleRule[];
  signupUntil: string;
  drawAt: string;
}

/** First problem that blocks publishing, or null. */
export function publishProblem(r: RaffleDraftInput): string | null {
  if (!r.name.trim()) return "Dê um nome ao sorteio.";
  if (!Number.isInteger(r.numberFrom) || !Number.isInteger(r.numberTo)) {
    return "Informe a faixa de números.";
  }
  if (r.numberFrom < 1 || r.numberTo < r.numberFrom) {
    return "A faixa de números está invertida.";
  }
  if (r.numberTo - r.numberFrom + 1 < r.perPerson) {
    return "Há menos números que o permitido por pessoa.";
  }
  if (r.rules.some((x) => !x.text.trim())) return "Preencha ou remova as regras vazias.";
  if (!r.signupUntil || !r.drawAt) return "Informe as datas do sorteio.";
  if (new Date(r.drawAt) < new Date(r.signupUntil)) {
    return "O sorteio não pode ser antes do fim das inscrições.";
  }
  return null;
}

/** Valid, distinct picks inside the range. Returns an error message or null. */
export function pickProblem(
  raffle: Pick<Raffle, "numberFrom" | "numberTo">,
  picks: number[],
  expected: number,
): string | null {
  if (picks.length !== expected) {
    return expected === 1
      ? "Escolha um número."
      : `Escolha ${expected} números.`;
  }
  if (new Set(picks).size !== picks.length) return "Escolha números diferentes.";
  if (
    picks.some(
      (n) => !Number.isInteger(n) || n < raffle.numberFrom || n > raffle.numberTo,
    )
  ) {
    return "Número fora da faixa do sorteio.";
  }
  return null;
}

// ---------------------------------------------------------------- dates ---

const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "30/10" */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

/** "19h" or "19h30" */
export function formatHour(iso: string): string {
  const { hour, minute } = zonedParts(new Date(iso));
  return minute ? `${hour}h${String(minute).padStart(2, "0")}` : `${hour}h`;
}

/** "30/10 · 19h" */
export function formatDrawAt(iso: string): string {
  return `${formatDayMonth(iso)} · ${formatHour(iso)}`;
}

// ------------------------------------------------------------- slug/link ---

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publicLinkPath(slug: string): string {
  return `/s/${slug}`;
}

// ----------------------------------------------------------- regulamento ---

export interface RegulamentoSection {
  title: string;
  lines: string[];
}

/** Store-level legal data has no home yet, so these stay visible placeholders. */
export const LEGAL_PLACEHOLDERS = {
  organizer: "[RAZÃO SOCIAL], CNPJ [00.000.000/0000-00]",
  certificate: "[Nº DO CERTIFICADO DE AUTORIZAÇÃO, SE EXIGIDO]",
  contact: "[CONTATO]",
} as const;

const fullDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

/** Regulamento generated from the raffle data (board 10b). */
export function buildRegulamento(r: Raffle, storeCity: string): RegulamentoSection[] {
  const obr = obligatoryRules(r.rules);
  const bonus = r.rules.filter((x) => x.type === "bonus");
  const from = r.signupFrom ?? r.publishedAt ?? r.createdAt;
  const how = [
    `Cadastro com nome, WhatsApp${r.fields.instagram ? " e Instagram" : ""} neste link.`,
    r.perPerson === 1
      ? `Escolha de 1 número de ${r.numberFrom} a ${r.numberTo}. Cada WhatsApp participa uma vez.`
      : `Escolha de ${r.perPerson} números de ${r.numberFrom} a ${r.numberTo}. Cada WhatsApp participa uma vez.`,
  ];
  if (obr.length) how.push(`Regras obrigatórias: ${obr.map((x) => x.text).join("; ")}.`);
  for (const b of bonus) how.push(`Bônus: ${b.text} vale +1 número.`);

  const sections: RegulamentoSection[] = [
    {
      title: "Quem organiza",
      lines: [`Selet, ${LEGAL_PLACEHOLDERS.organizer}, ${storeCity}.`, LEGAL_PLACEHOLDERS.certificate],
    },
    {
      title: "Período",
      lines: [
        `Inscrições de ${fullDate.format(new Date(from))} a ${fullDate.format(new Date(r.signupUntil))}, ${formatHour(r.signupUntil)}. Sorteio em ${fullDate.format(new Date(r.drawAt))}, ${formatHour(r.drawAt)}${r.location ? `, ${r.location.charAt(0).toLowerCase()}${r.location.slice(1)}` : ""}.`,
      ],
    },
    { title: "Como participar", lines: how },
    {
      title: "Conferência",
      lines: [
        "A equipe confere as regras à mão pelo perfil informado. Só concorrem números de quem cumpriu todas as obrigatórias até o início do sorteio.",
      ],
    },
    {
      title: "Sorteio",
      lines: [
        "Se sair um número sem dono ou de quem não cumpriu as regras, sorteia-se de novo até sair um número válido.",
      ],
    },
    {
      title: "Prêmio e retirada",
      lines: [
        `${r.prize}.${r.pickup ? ` ${r.pickup}, com documento.` : ""} Prêmio pessoal e não trocável por dinheiro.`,
      ],
    },
    {
      title: "Seus dados",
      lines: [
        `Usamos nome, WhatsApp${r.fields.instagram ? " e Instagram" : ""} para conferir as regras e avisar o resultado. Novidades só para quem marcou a opção. Para corrigir ou apagar seus dados, fale com ${LEGAL_PLACEHOLDERS.contact}.`,
      ],
    },
  ];
  if (r.notes.trim()) sections.push({ title: "Observações da loja", lines: [r.notes.trim()] });
  return sections;
}

// ------------------------------------------------------------- customers ---

export interface CustomerLite {
  id: string;
  name: string;
  phone?: string;
  instagram?: string;
  orderCount: number;
  since: string;
}

/** The customer whose phone is the same WhatsApp (customers store it masked). */
export function matchCustomer<T extends CustomerLite>(
  customers: T[],
  phoneDigits: string,
): T | null {
  return (
    customers.find((c) => c.phone && normalizePhone(c.phone) === phoneDigits) ??
    null
  );
}

// ------------------------------------------------------- public participant ---

/** What a person may see about their own entry (never the token or phone). */
export interface PublicEntryView {
  name: string;
  instagram: string;
  numbers: { n: number; kind: NumberKind }[];
  /** Bonus/extra numbers still to choose. */
  pendingSlots: number;
  /** Obligatory rules the team has not confirmed yet. */
  missing: string[];
  status: EntryStatus;
}

export function publicEntryView(raffle: Raffle, e: RaffleEntry): PublicEntryView {
  return {
    name: e.name,
    instagram: e.instagram,
    numbers: e.numbers.map((x) => ({ n: x.n, kind: x.kind })),
    pendingSlots: e.slots.length,
    missing: missingRules(raffle.rules, e).map((r) => r.text),
    status: e.status,
  };
}
