import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { sendWhatsApp, whatsappIsStubbed } from "@/lib/whatsapp";
import {
  SLUG_PATTERN,
  abbreviateName,
  firstName,
  formatPhone,
  deriveStatus,
  linkState,
  matchCustomer,
  missingBonusSlots,
  normalizePhone,
  pickProblem,
  publishProblem,
  type DrawLogEntry,
  type EntryNumber,
  type EntrySlot,
  type Lead,
  type LeadKind,
  type LinkState,
  type Raffle,
  type RaffleEntry,
  type RaffleFields,
  type RaffleRule,
  type RaffleStatus,
} from "@/lib/raffles";
import { createCustomer, listCustomers } from "./customers";

/* ------------------------------------------------------------------ refs -- */

function storeRef(storeId: string) {
  return getDb().collection("stores").doc(storeId);
}
const rafflesCol = (s: string) => storeRef(s).collection("raffles");
const entriesCol = (s: string) => storeRef(s).collection("raffleEntries");
const claimsCol = (s: string) => storeRef(s).collection("raffleNumbers");
const leadsCol = (s: string) => storeRef(s).collection("leads");
const slugsCol = () => getDb().collection("raffleSlugs");
const codesCol = () => getDb().collection("raffleCodes");

const entryId = (raffleId: string, phone: string) => `${raffleId}_${phone}`;
const claimId = (raffleId: string, n: number) => `${raffleId}_${n}`;

const iso = (t?: Timestamp | null) => t?.toDate().toISOString() ?? "";
const ts = (s: string) => Timestamp.fromDate(new Date(s));

/** A number someone else took first. `number` lets the picker mark it. */
export class NumberTakenError extends Error {
  constructor(public number: number) {
    super(`O ${number} acabou de ser escolhido por outra pessoa.`);
    this.name = "NumberTakenError";
  }
}

export class DuplicateEntryError extends Error {
  constructor() {
    super("Esse WhatsApp já participa deste sorteio.");
    this.name = "DuplicateEntryError";
  }
}

/* --------------------------------------------------------------- mappers -- */

export function toRaffle(id: string, d: FirebaseFirestore.DocumentData): Raffle {
  return {
    id,
    name: d.name ?? "",
    prize: d.prize ?? "",
    location: d.location ?? "",
    pickup: d.pickup ?? "",
    notes: d.notes ?? "",
    slug: d.slug ?? "",
    status: d.status ?? "rascunho",
    signupFrom: d.signupFrom ? iso(d.signupFrom) : null,
    signupUntil: iso(d.signupUntil),
    drawAt: iso(d.drawAt),
    numberFrom: d.numberFrom ?? 1,
    numberTo: d.numberTo ?? 100,
    perPerson: d.perPerson ?? 1,
    rules: d.rules ?? [],
    fields: d.fields ?? { instagram: true, birthday: false, email: false },
    draws: d.draws ?? [],
    winner: d.winner ?? null,
    showResult: d.showResult ?? false,
    publishedAt: d.publishedAt ? iso(d.publishedAt) : null,
    regulamentoAt: iso(d.regulamentoAt),
    createdAt: iso(d.createdAt),
  };
}

function toNumbers(list: FirebaseFirestore.DocumentData[] | undefined): EntryNumber[] {
  return (list ?? []).map((n) => ({
    n: n.n,
    kind: n.kind,
    ruleId: n.ruleId ?? undefined,
    reason: n.reason ?? undefined,
    by: n.by ?? undefined,
    at: n.at ?? "",
  }));
}

export function toEntry(id: string, d: FirebaseFirestore.DocumentData): RaffleEntry {
  return {
    id,
    raffleId: d.raffleId,
    name: d.name ?? "",
    phone: d.phone ?? "",
    instagram: d.instagram ?? "",
    email: d.email ?? undefined,
    birthday: d.birthday ?? undefined,
    novidades: d.novidades ?? false,
    createdAt: iso(d.createdAt),
    checks: d.checks ?? {},
    waived: d.waived ?? {},
    status: d.status ?? "pend",
    exclReason: d.exclReason ?? undefined,
    numbers: toNumbers(d.numbers),
    slots: (d.slots ?? []) as EntrySlot[],
    customerId: d.customerId ?? null,
    token: d.token ?? "",
  };
}

export function toLead(id: string, d: FirebaseFirestore.DocumentData): Lead {
  return {
    id,
    name: d.name ?? "",
    phone: d.phone ?? id,
    instagram: d.instagram ?? "",
    email: d.email ?? undefined,
    novidades: d.novidades ?? false,
    raffleIds: d.raffleIds ?? [],
    raffleNames: [],
    createdAt: iso(d.createdAt),
    lastAt: iso(d.lastAt),
    kind: (d.kind ?? "novo") as LeadKind,
    customerId: d.customerId ?? null,
  };
}

/* ----------------------------------------------------------- admin reads -- */

export interface RaffleSummary extends Raffle {
  entryCount: number;
  numberCount: number;
  pendingCount: number;
}

async function countWhere(
  q: FirebaseFirestore.Query,
): Promise<number> {
  return (await q.count().get()).data().count;
}

export async function listRaffles(storeId: string): Promise<RaffleSummary[]> {
  const snap = await rafflesCol(storeId).get();
  const raffles = snap.docs.map((d) => toRaffle(d.id, d.data()));
  const out = await Promise.all(
    raffles.map(async (r) => {
      const [entryCount, numberCount, pendingCount] = await Promise.all([
        countWhere(entriesCol(storeId).where("raffleId", "==", r.id)),
        countWhere(claimsCol(storeId).where("raffleId", "==", r.id)),
        countWhere(
          entriesCol(storeId)
            .where("raffleId", "==", r.id)
            .where("status", "==", "pend"),
        ),
      ]);
      return { ...r, entryCount, numberCount, pendingCount };
    }),
  );
  // Open first (soonest draw), drafts, then finished (latest first).
  const rank: Record<RaffleStatus, number> = { aberto: 0, encerrado: 0, rascunho: 1, sorteado: 2 };
  return out.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.status === "sorteado"
        ? b.drawAt.localeCompare(a.drawAt)
        : a.drawAt.localeCompare(b.drawAt)),
  );
}

export async function getRaffle(storeId: string, raffleId: string): Promise<Raffle | null> {
  const snap = await rafflesCol(storeId).doc(raffleId).get();
  return snap.exists ? toRaffle(snap.id, snap.data()!) : null;
}

export async function listEntries(storeId: string, raffleId: string): Promise<RaffleEntry[]> {
  const snap = await entriesCol(storeId).where("raffleId", "==", raffleId).get();
  return snap.docs
    .map((d) => toEntry(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Entries still waiting on the team, across raffles that can still be drawn. */
export async function countPendingEntries(storeId: string): Promise<number> {
  const snap = await rafflesCol(storeId).where("status", "in", ["aberto", "encerrado"]).get();
  const counts = await Promise.all(
    snap.docs.map((d) =>
      countWhere(
        entriesCol(storeId).where("raffleId", "==", d.id).where("status", "==", "pend"),
      ),
    ),
  );
  return counts.reduce((a, b) => a + b, 0);
}

export async function countLeads(storeId: string): Promise<{ total: number; novos: number }> {
  const [total, novos] = await Promise.all([
    countWhere(leadsCol(storeId)),
    countWhere(leadsCol(storeId).where("kind", "==", "novo")),
  ]);
  return { total, novos };
}

export interface LeadView extends Lead {
  /** Same WhatsApp already in Clientes (suggested link). */
  match: { id: string; name: string; orderCount: number; since: string } | null;
  wonRaffleIds: string[];
}

export async function listLeads(storeId: string): Promise<LeadView[]> {
  const [leadSnap, raffleSnap, customers] = await Promise.all([
    leadsCol(storeId).orderBy("lastAt", "desc").get(),
    rafflesCol(storeId).get(),
    listCustomers(storeId),
  ]);
  const raffles = new Map(raffleSnap.docs.map((d) => [d.id, toRaffle(d.id, d.data())]));
  const byId = new Map(customers.map((c) => [c.id, c]));
  return leadSnap.docs.map((d) => {
    const lead = toLead(d.id, d.data());
    const found = lead.customerId
      ? byId.get(lead.customerId)
      : matchCustomer(customers, lead.phone);
    return {
      ...lead,
      raffleNames: lead.raffleIds.map((id) => raffles.get(id)?.name).filter((x): x is string => !!x),
      wonRaffleIds: lead.raffleIds.filter((id) => raffles.get(id)?.winner?.entryId.endsWith(`_${lead.phone}`)),
      match: found
        ? { id: found.id, name: found.name, orderCount: found.orderCount, since: found.since }
        : null,
    };
  });
}

/* ------------------------------------------------------- raffle authoring -- */

export interface RaffleInput {
  name: string;
  prize: string;
  location: string;
  pickup: string;
  notes: string;
  slug: string;
  signupFrom: string | null;
  signupUntil: string;
  drawAt: string;
  numberFrom: number;
  numberTo: number;
  perPerson: number;
  rules: RaffleRule[];
  fields: RaffleFields;
}

function writable(input: RaffleInput) {
  return {
    name: input.name,
    prize: input.prize,
    location: input.location,
    pickup: input.pickup,
    notes: input.notes,
    slug: input.slug,
    signupFrom: input.signupFrom ? ts(input.signupFrom) : null,
    signupUntil: ts(input.signupUntil),
    drawAt: ts(input.drawAt),
    numberFrom: input.numberFrom,
    numberTo: input.numberTo,
    perPerson: input.perPerson,
    rules: input.rules,
    fields: input.fields,
  };
}

/** Creates a draft (raffleId null) or edits one. Published raffles keep their
 *  number range, per-person limit and link; everything else stays editable. */
export async function saveRaffle(
  storeId: string,
  raffleId: string | null,
  input: RaffleInput,
): Promise<string> {
  if (!SLUG_PATTERN.test(input.slug)) {
    throw new Error("O endereço do link só pode ter letras minúsculas, números e hífens.");
  }
  if (raffleId === null) {
    const ref = rafflesCol(storeId).doc();
    await ref.set({
      ...writable(input),
      status: "rascunho",
      draws: [],
      winner: null,
      showResult: false,
      publishedAt: null,
      regulamentoAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
    return ref.id;
  }
  const ref = rafflesCol(storeId).doc(raffleId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Sorteio não encontrado.");
    const cur = toRaffle(snap.id, snap.data()!);
    if (cur.status === "sorteado") throw new Error("Esse sorteio já foi realizado.");
    const patch = writable(input);
    if (cur.status !== "rascunho") {
      Object.assign(patch, {
        numberFrom: cur.numberFrom,
        numberTo: cur.numberTo,
        perPerson: cur.perPerson,
        slug: cur.slug,
        // Rules, texts and prize changes re-date the regulamento that people accepted.
        regulamentoAt: Timestamp.now(),
      });
    }
    tx.update(ref, patch);
  });
  return raffleId;
}

export async function publishRaffle(storeId: string, raffleId: string): Promise<void> {
  const ref = rafflesCol(storeId).doc(raffleId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Sorteio não encontrado.");
    const r = toRaffle(snap.id, snap.data()!);
    if (r.status !== "rascunho") throw new Error("Esse sorteio já foi publicado.");
    const problem = publishProblem(r);
    if (problem) throw new Error(problem);
    const slugRef = slugsCol().doc(r.slug);
    const slugSnap = await tx.get(slugRef);
    if (slugSnap.exists) throw new Error("Esse endereço de link já está em uso. Escolha outro.");
    tx.set(slugRef, { storeId, raffleId });
    tx.update(ref, {
      status: "aberto",
      publishedAt: Timestamp.now(),
      regulamentoAt: Timestamp.now(),
    });
  });
}

export async function setSignupsOpen(
  storeId: string,
  raffleId: string,
  open: boolean,
): Promise<void> {
  const ref = rafflesCol(storeId).doc(raffleId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Sorteio não encontrado.");
    const r = toRaffle(snap.id, snap.data()!);
    if (open) {
      if (r.status !== "encerrado") throw new Error("As inscrições não estão encerradas.");
      if (new Date(r.signupUntil) < new Date()) {
        throw new Error("O prazo das inscrições já passou. Edite a data para reabrir.");
      }
      tx.update(ref, { status: "aberto" });
    } else {
      if (r.status !== "aberto") throw new Error("As inscrições não estão abertas.");
      tx.update(ref, { status: "encerrado" });
    }
  });
}

/* --------------------------------------------------- numbers (shared core) -- */

/** Claims `picks` for `entryRef` inside a transaction (reads happen here, so
 *  call it before any tx write). Returns the writes to run afterwards. */
async function claimNumbers(
  tx: FirebaseFirestore.Transaction,
  storeId: string,
  raffleId: string,
  entryDocId: string,
  picks: number[],
): Promise<() => void> {
  const refs = picks.map((n) => claimsCol(storeId).doc(claimId(raffleId, n)));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  const taken = picks.find((_, i) => snaps[i].exists);
  if (taken !== undefined) throw new NumberTakenError(taken);
  return () => {
    picks.forEach((n, i) =>
      tx.set(refs[i], { raffleId, entryId: entryDocId, n }),
    );
  };
}

/** Moves `picks` into the entry's pending slots (bonus/extra) — shared by the
 *  person (link) and the team ("escolher por ele"). */
async function fillSlots(
  storeId: string,
  entryDocId: string,
  picks: number[],
  by?: string,
): Promise<void> {
  const db = getDb();
  const ref = entriesCol(storeId).doc(entryDocId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Participante não encontrado.");
    const e = toEntry(snap.id, snap.data()!);
    const raffleSnap = await tx.get(rafflesCol(storeId).doc(e.raffleId));
    const raffle = toRaffle(raffleSnap.id, raffleSnap.data()!);
    if (raffle.status === "sorteado") throw new Error("Esse sorteio já foi realizado.");
    if (e.status === "excl") throw new Error("Esse participante foi excluído.");
    if (picks.length < 1 || picks.length > e.slots.length) {
      throw new Error(
        e.slots.length === 0
          ? "Não há números a escolher."
          : `Escolha até ${e.slots.length} número(s).`,
      );
    }
    const problem = pickProblem(raffle, picks, picks.length);
    if (problem) throw new Error(problem);
    const write = await claimNumbers(tx, storeId, raffle.id, e.id, picks);
    const now = new Date().toISOString();
    const used = e.slots.slice(0, picks.length);
    const added: EntryNumber[] = picks.map((n, i) => ({
      n,
      kind: used[i].kind,
      ruleId: used[i].ruleId,
      reason: used[i].reason,
      by: by ?? used[i].by,
      at: now,
    }));
    write();
    tx.update(ref, {
      numbers: [...e.numbers, ...added],
      slots: e.slots.slice(picks.length),
    });
  });
}

export const pickSlotNumbersAdmin = (
  storeId: string,
  entryDocId: string,
  picks: number[],
  by: string,
) => fillSlots(storeId, entryDocId, picks, by);

/* ------------------------------------------------------ admin entry edits -- */

async function mutateEntry(
  storeId: string,
  entryDocId: string,
  fn: (ctx: {
    tx: FirebaseFirestore.Transaction;
    entry: RaffleEntry;
    raffle: Raffle;
    ref: FirebaseFirestore.DocumentReference;
  }) => Promise<Record<string, unknown> | void>,
): Promise<void> {
  const ref = entriesCol(storeId).doc(entryDocId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Participante não encontrado.");
    const entry = toEntry(snap.id, snap.data()!);
    const raffleSnap = await tx.get(rafflesCol(storeId).doc(entry.raffleId));
    const raffle = toRaffle(raffleSnap.id, raffleSnap.data()!);
    if (raffle.status === "sorteado") throw new Error("Esse sorteio já foi realizado.");
    const patch = await fn({ tx, entry, raffle, ref });
    if (patch) tx.update(ref, patch);
  });
}

export async function setRuleCheck(
  storeId: string,
  entryDocId: string,
  ruleId: string,
  on: boolean,
): Promise<void> {
  await mutateEntry(storeId, entryDocId, async ({ entry, raffle }) => {
    const rule = raffle.rules.find((r) => r.id === ruleId);
    if (!rule) throw new Error("Regra não encontrada.");
    if (entry.status === "excl") throw new Error("Esse participante foi excluído.");
    const checks = { ...entry.checks, [ruleId]: on };
    let slots = entry.slots;
    if (rule.type === "bonus") {
      if (on) {
        const owed = missingBonusSlots(raffle.rules, { checks, numbers: entry.numbers, slots });
        slots = [
          ...slots,
          ...owed
            .filter((r) => r.id === ruleId)
            .map((r): EntrySlot => ({ kind: "bonus", ruleId: r.id, at: new Date().toISOString() })),
        ];
      } else {
        // Only a not-yet-chosen number can be taken back here; chosen ones are removed by hand.
        slots = slots.filter((s) => s.ruleId !== ruleId);
      }
    }
    return { checks, slots, status: deriveStatus(raffle.rules, { ...entry, checks }) };
  });
}

export async function waiveRule(
  storeId: string,
  entryDocId: string,
  ruleId: string,
  reason: string,
  by: string,
): Promise<void> {
  await mutateEntry(storeId, entryDocId, async ({ entry, raffle }) => {
    const rule = raffle.rules.find((r) => r.id === ruleId);
    if (!rule || rule.type !== "obr") throw new Error("Só dá para dispensar regras obrigatórias.");
    if (entry.checks[ruleId] || entry.waived[ruleId]) throw new Error("Essa regra já está cumprida.");
    const waived = { ...entry.waived, [ruleId]: { by, at: new Date().toISOString(), reason } };
    return { waived, status: deriveStatus(raffle.rules, { ...entry, waived }) };
  });
}

export async function grantExtraNumbers(
  storeId: string,
  entryDocId: string,
  count: number,
  reason: string,
  by: string,
): Promise<void> {
  await mutateEntry(storeId, entryDocId, async ({ entry }) => {
    if (entry.status === "excl") throw new Error("Esse participante foi excluído.");
    const at = new Date().toISOString();
    const added: EntrySlot[] = Array.from({ length: count }, () => ({ kind: "extra", reason, by, at }));
    return { slots: [...entry.slots, ...added] };
  });
}

export async function removeEntryNumber(
  storeId: string,
  entryDocId: string,
  n: number,
): Promise<void> {
  await mutateEntry(storeId, entryDocId, async ({ tx, entry, raffle }) => {
    if (!entry.numbers.some((x) => x.n === n)) throw new Error("Número não encontrado.");
    tx.delete(claimsCol(storeId).doc(claimId(raffle.id, n)));
    return { numbers: entry.numbers.filter((x) => x.n !== n) };
  });
}

/** Out of the draw: numbers go back to the pool; the lead stays in Leads. */
export async function excludeEntry(
  storeId: string,
  entryDocId: string,
  reason: string,
): Promise<void> {
  await mutateEntry(storeId, entryDocId, async ({ tx, entry, raffle }) => {
    for (const x of entry.numbers) tx.delete(claimsCol(storeId).doc(claimId(raffle.id, x.n)));
    return { status: "excl", exclReason: reason, numbers: [], slots: [] };
  });
}

/* ------------------------------------------------------------------ leads -- */

export async function linkLeadToCustomer(
  storeId: string,
  leadId: string,
  customerId: string,
): Promise<void> {
  const db = getDb();
  const leadRef = leadsCol(storeId).doc(leadId);
  const entries = await entriesCol(storeId).where("phone", "==", leadId).get();
  await db.runTransaction(async (tx) => {
    const [lead, customer] = await Promise.all([
      tx.get(leadRef),
      tx.get(storeRef(storeId).collection("customers").doc(customerId)),
    ]);
    if (!lead.exists) throw new Error("Lead não encontrado.");
    if (!customer.exists) throw new Error("Cliente não encontrado.");
    tx.update(leadRef, { customerId, kind: "vinc" });
    entries.docs.forEach((d) => tx.update(d.ref, { customerId }));
  });
}

/** Creates the customer through the regular path (keeps the store summary right). */
export async function convertLeadToCustomer(storeId: string, leadId: string): Promise<string> {
  const leadRef = leadsCol(storeId).doc(leadId);
  const snap = await leadRef.get();
  if (!snap.exists) throw new Error("Lead não encontrado.");
  const lead = toLead(snap.id, snap.data()!);
  if (lead.customerId) throw new Error("Esse lead já está ligado a um cliente.");
  const customerId = await createCustomer(storeId, {
    name: lead.name,
    phone: formatPhone(lead.phone),
    instagram: lead.instagram || undefined,
    tags: [],
  });
  const entries = await entriesCol(storeId).where("phone", "==", leadId).get();
  const batch = getDb().batch();
  batch.update(leadRef, { customerId, kind: "cli" });
  entries.docs.forEach((d) => batch.update(d.ref, { customerId }));
  await batch.commit();
  return customerId;
}

/* ------------------------------------------------------------------- draw -- */

export async function confirmWinner(
  storeId: string,
  raffleId: string,
  n: number,
  history: DrawLogEntry[],
  by: string,
): Promise<void> {
  const raffleRef = rafflesCol(storeId).doc(raffleId);
  await getDb().runTransaction(async (tx) => {
    const [raffleSnap, claim] = await Promise.all([
      tx.get(raffleRef),
      tx.get(claimsCol(storeId).doc(claimId(raffleId, n))),
    ]);
    if (!raffleSnap.exists) throw new Error("Sorteio não encontrado.");
    const raffle = toRaffle(raffleSnap.id, raffleSnap.data()!);
    if (raffle.status === "sorteado") throw new Error("Esse sorteio já foi realizado.");
    if (raffle.status === "rascunho") throw new Error("Publique o sorteio antes de realizá-lo.");
    if (!claim.exists) throw new Error(`Ninguém escolheu o nº ${n}.`);
    const entrySnap = await tx.get(entriesCol(storeId).doc(claim.data()!.entryId));
    const entry = toEntry(entrySnap.id, entrySnap.data()!);
    if (entry.status !== "ok") throw new Error("Esse participante ainda não cumpriu as regras.");
    const at = new Date().toISOString();
    tx.update(raffleRef, {
      status: "sorteado",
      winner: { number: n, entryId: entry.id, name: entry.name },
      draws: [...history, { at, text: `Nº ${n} confirmado como ganhador por ${by}` }],
    });
  });
}

export interface AnnounceOptions {
  showResult: boolean;
  notifyWinner: boolean;
  notifyAll: boolean;
}

/** Publishes the result and sends the optional WhatsApp notices. Sending
 *  failures never undo the result; they are counted and returned. */
export async function announceResult(
  storeId: string,
  raffleId: string,
  opts: AnnounceOptions,
): Promise<{ sent: number; failed: number }> {
  const raffle = await getRaffle(storeId, raffleId);
  if (!raffle?.winner) throw new Error("Confirme o ganhador antes de anunciar.");
  await rafflesCol(storeId).doc(raffleId).update({ showResult: opts.showResult });
  const entries = await listEntries(storeId, raffleId);
  const winner = raffle.winner;
  const targets: { phone: string; text: string }[] = [];
  if (opts.notifyAll) {
    for (const e of entries.filter((x) => x.status !== "excl")) {
      const won = e.id === winner.entryId;
      targets.push({
        phone: e.phone,
        text: won
          ? `${firstName(e.name)}, o nº ${winner.number} foi sorteado e é seu! Você ganhou: ${raffle.prize}. ${raffle.pickup}`
          : `O sorteio "${raffle.name}" saiu: nº ${winner.number}, de ${abbreviateName(winner.name)}. Obrigado por participar!`,
      });
    }
  } else if (opts.notifyWinner) {
    const e = entries.find((x) => x.id === winner.entryId);
    if (e) {
      targets.push({
        phone: e.phone,
        text: `${firstName(e.name)}, o nº ${winner.number} foi sorteado e é seu! Você ganhou: ${raffle.prize}. ${raffle.pickup}`,
      });
    }
  }
  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      await sendWhatsApp(t.phone, t.text);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

/* ======================================================== public (no login) == */

export interface PublicRaffle {
  storeId: string;
  raffle: Raffle;
  /** Numbers already chosen. */
  taken: number[];
  state: LinkState;
}

export async function getPublicRaffle(slug: string): Promise<PublicRaffle | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const slugSnap = await slugsCol().doc(slug).get();
  if (!slugSnap.exists) return null;
  const { storeId, raffleId } = slugSnap.data() as { storeId: string; raffleId: string };
  const [raffleSnap, claims] = await Promise.all([
    rafflesCol(storeId).doc(raffleId).get(),
    claimsCol(storeId).where("raffleId", "==", raffleId).select("n").get(),
  ]);
  if (!raffleSnap.exists) return null;
  const raffle = toRaffle(raffleSnap.id, raffleSnap.data()!);
  const taken = claims.docs.map((d) => d.data().n as number);
  const free = raffle.numberTo - raffle.numberFrom + 1 - taken.length;
  return { storeId, raffle, taken, state: linkState(raffle, free) };
}

/** Participant by the secret in their cookie / link. */
export async function getEntryByToken(
  storeId: string,
  raffleId: string,
  token: string,
): Promise<RaffleEntry | null> {
  if (!token || token.length < 16) return null;
  const snap = await entriesCol(storeId)
    .where("raffleId", "==", raffleId)
    .where("token", "==", token)
    .limit(1)
    .get();
  return snap.empty ? null : toEntry(snap.docs[0].id, snap.docs[0].data());
}

export interface RegisterInput {
  phone: string;
  name: string;
  instagram: string;
  email?: string;
  birthday?: { day: number; month: number };
  novidades: boolean;
  picks: number[];
}

/** Entry + number claims + lead in ONE transaction: two people can never end
 *  up with the same number, and nobody is left registered without a number. */
export async function registerEntry(
  pub: PublicRaffle,
  input: RegisterInput,
): Promise<RaffleEntry> {
  const { storeId, raffle } = pub;
  if (raffle.status !== "aberto") throw new Error("As inscrições não estão abertas.");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("WhatsApp inválido.");
  const problem = pickProblem(raffle, input.picks, raffle.perPerson);
  if (problem) throw new Error(problem);

  const db = getDb();
  const docId = entryId(raffle.id, phone);
  const ref = entriesCol(storeId).doc(docId);
  const leadRef = leadsCol(storeId).doc(phone);
  const token = randomBytes(16).toString("hex");
  const now = new Date();

  await db.runTransaction(async (tx) => {
    const [existing, lead] = await Promise.all([tx.get(ref), tx.get(leadRef)]);
    if (existing.exists) throw new DuplicateEntryError();
    const write = await claimNumbers(tx, storeId, raffle.id, docId, input.picks);
    const at = now.toISOString();
    write();
    tx.set(ref, {
      raffleId: raffle.id,
      name: input.name,
      phone,
      instagram: input.instagram,
      email: input.email ?? null,
      birthday: input.birthday ?? null,
      novidades: input.novidades,
      createdAt: Timestamp.fromDate(now),
      regulamentoAt: ts(raffle.regulamentoAt),
      checks: {},
      waived: {},
      status: raffle.rules.some((r) => r.type === "obr") ? "pend" : "ok",
      numbers: input.picks.map((n) => ({ n, kind: "cadastro", at })),
      slots: [],
      customerId: lead.exists ? (lead.data()!.customerId ?? null) : null,
      token,
    });
    if (lead.exists) {
      tx.update(leadRef, {
        raffleIds: FieldValue.arrayUnion(raffle.id),
        lastAt: Timestamp.fromDate(now),
        novidades: lead.data()!.novidades || input.novidades,
        ...(input.instagram && !lead.data()!.instagram ? { instagram: input.instagram } : {}),
      });
    } else {
      tx.set(leadRef, {
        name: input.name,
        phone,
        instagram: input.instagram,
        email: input.email ?? null,
        novidades: input.novidades,
        raffleIds: [raffle.id],
        createdAt: Timestamp.fromDate(now),
        lastAt: Timestamp.fromDate(now),
        kind: "novo",
        customerId: null,
      });
    }
  });
  const snap = await ref.get();
  return toEntry(snap.id, snap.data()!);
}

/** The person fills their own bonus/extra slots from the link. */
export async function pickOwnSlots(
  storeId: string,
  raffleId: string,
  token: string,
  picks: number[],
): Promise<void> {
  const entry = await getEntryByToken(storeId, raffleId, token);
  if (!entry) throw new Error("Link inválido. Peça um novo à loja.");
  await fillSlots(storeId, entry.id, picks);
}

/* ------------------------------------------------- WhatsApp login codes -- */

const CODE_TTL_MS = 10 * 60_000;
const RESEND_MS = 30_000;
const SEND_WINDOW_MS = 10 * 60_000;
const MAX_SENDS = 3;
const MAX_ATTEMPTS = 5;
const PROOF_TTL_MS = 30 * 60_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const codeKey = (raffleId: string, phone: string) => `${raffleId}_${phone}`;

export interface PhoneLookup {
  hasEntry: boolean;
  /** Already a lead or a customer: needs the code to load their data. */
  known: boolean;
}

export async function lookupPhone(pub: PublicRaffle, phone: string): Promise<PhoneLookup> {
  const { storeId, raffle } = pub;
  const [entry, lead] = await Promise.all([
    entriesCol(storeId).doc(entryId(raffle.id, phone)).get(),
    leadsCol(storeId).doc(phone).get(),
  ]);
  if (entry.exists) return { hasEntry: true, known: true };
  if (lead.exists) return { hasEntry: false, known: true };
  // ponytail: scans customers (masked phones can't be queried); add a phoneDigits field if a store grows past a few thousand.
  const customers = await listCustomers(storeId);
  return { hasEntry: false, known: !!matchCustomer(customers, phone) };
}

export async function requestCode(pub: PublicRaffle, phone: string): Promise<{ resendIn: number }> {
  const ref = codesCol().doc(codeKey(pub.raffle.id, phone));
  const now = Date.now();
  const code = String(randomInt(100000, 1000000));
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    const windowStart: number = cur && now - cur.windowStart < SEND_WINDOW_MS ? cur.windowStart : now;
    const sentCount: number = cur && windowStart === cur.windowStart ? cur.sentCount : 0;
    if (cur && now - cur.sentAt < RESEND_MS) {
      throw new Error("Aguarde alguns segundos para pedir outro código.");
    }
    if (sentCount >= MAX_SENDS) {
      throw new Error("Muitos pedidos de código. Tente de novo em alguns minutos.");
    }
    tx.set(ref, {
      raffleId: pub.raffle.id,
      codeHash: sha(code + ref.id),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      windowStart,
      sentCount: sentCount + 1,
      sentAt: now,
      // Emulator/dev only, so e2e can read the code; never set in production.
      ...(whatsappIsStubbed() ? { devCode: code } : {}),
    });
  });
  await sendWhatsApp(phone, `Seu código Selet para o sorteio "${pub.raffle.name}": ${code}. Vale 10 minutos.`);
  return { resendIn: RESEND_MS / 1000 };
}

/** Returns a short-lived proof the phone is the caller's, or throws. */
export async function verifyCode(
  pub: PublicRaffle,
  phone: string,
  code: string,
): Promise<{ proof: string }> {
  const ref = codesCol().doc(codeKey(pub.raffle.id, phone));
  const proof = randomBytes(16).toString("hex");
  // Errors are returned, not thrown, from the transaction: a throw would roll
  // back the attempt counter and make the code guessable.
  const problem = await getDb().runTransaction(async (tx): Promise<string | null> => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    if (!cur || !cur.codeHash) return "Peça um código primeiro.";
    if (Date.now() > cur.expiresAt) return "Esse código expirou. Peça outro.";
    if (cur.attempts >= MAX_ATTEMPTS) return "Muitas tentativas. Peça um novo código.";
    if (cur.codeHash !== sha(code + ref.id)) {
      tx.update(ref, { attempts: cur.attempts + 1 });
      return "Código incorreto.";
    }
    tx.update(ref, {
      codeHash: null,
      proofHash: sha(proof + ref.id),
      proofExpiresAt: Date.now() + PROOF_TTL_MS,
    });
    return null;
  });
  if (problem) throw new Error(problem);
  return { proof };
}

export async function checkProof(raffleId: string, phone: string, proof: string): Promise<boolean> {
  if (!proof) return false;
  const ref = codesCol().doc(codeKey(raffleId, phone));
  const snap = await ref.get();
  const cur = snap.data();
  return !!cur?.proofHash && cur.proofHash === sha(proof + ref.id) && Date.now() < cur.proofExpiresAt;
}

/** Name + Instagram to prefill for a verified returning person. */
export async function getKnownProfile(
  storeId: string,
  phone: string,
): Promise<{ name: string; instagram: string; novidades: boolean } | null> {
  const lead = await leadsCol(storeId).doc(phone).get();
  if (lead.exists) {
    const l = toLead(lead.id, lead.data()!);
    return { name: l.name, instagram: l.instagram, novidades: l.novidades };
  }
  const customers = await listCustomers(storeId);
  const c = matchCustomer(customers, phone);
  return c ? { name: c.name, instagram: c.instagram ?? "", novidades: false } : null;
}

export async function getEntryByPhone(
  storeId: string,
  raffleId: string,
  phone: string,
): Promise<RaffleEntry | null> {
  const snap = await entriesCol(storeId).doc(entryId(raffleId, phone)).get();
  return snap.exists ? toEntry(snap.id, snap.data()!) : null;
}

/** Participants counted on the public result footer (excluded people don't count). */
export async function countRaffleParticipants(storeId: string, raffleId: string): Promise<number> {
  const all = await countWhere(entriesCol(storeId).where("raffleId", "==", raffleId));
  const excl = await countWhere(
    entriesCol(storeId).where("raffleId", "==", raffleId).where("status", "==", "excl"),
  );
  return all - excl;
}
