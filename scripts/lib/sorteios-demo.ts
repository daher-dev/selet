/**
 * Demo sorteios mirroring the design (docs: artifact boards sorteios-1a…12c):
 * an open "Aniversário Selet 3 anos" (48 participants, 52 numbers, 9 waiting
 * for conferência), a draft "Black Friday Selet" and a finished "Dia das
 * Crianças" won by nº 37. Deterministic ids, safe to re-run. Demo/emulator only.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore";

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

const RULES = [
  { id: "seg", text: "Seguir @selet.vv", type: "obr" },
  { id: "cur", text: "Curtir o post do sorteio", type: "obr" },
  { id: "gru", text: "Convidar alguém para o grupo VIP", type: "bonus" },
] as const;

interface Person {
  name: string;
  phone: string; // digits
  ig: string;
  customer?: string; // customers doc id (links the lead)
  checks: Record<string, boolean>;
  numbers: { n: number; kind: "cadastro" | "bonus" | "extra"; ruleId?: string; reason?: string; by?: string }[];
  slots?: { kind: "bonus" | "extra"; ruleId?: string }[];
  excl?: string;
  when: string; // ISO
}

const NAMED: Person[] = [
  { name: "Juliana Prado", phone: "27991204432", ig: "juprado", checks: { seg: true }, numbers: [{ n: 23, kind: "cadastro" }], when: "2026-10-19T10:12:00-03:00" },
  { name: "Thiago Ramos", phone: "27997342210", ig: "thiramos", checks: { seg: true, cur: true, gru: true }, numbers: [{ n: 150, kind: "cadastro" }, { n: 77, kind: "extra", reason: "Trouxe 2 amigas à loja", by: "Ana Costa" }], slots: [{ kind: "bonus", ruleId: "gru" }], when: "2026-10-18T14:32:00-03:00" },
  { name: "Fernanda Reis", phone: "27988451190", ig: "fe.reis", checks: {}, numbers: [{ n: 3, kind: "cadastro" }], when: "2026-10-18T16:05:00-03:00" },
  { name: "Carla Menezes", phone: "27998124471", ig: "carlamenezes", customer: "carla-menezes", checks: { seg: true, cur: true, gru: true }, numbers: [{ n: 7, kind: "cadastro" }, { n: 112, kind: "bonus", ruleId: "gru" }], when: "2026-10-17T09:40:00-03:00" },
  { name: "Ana Clara Dias", phone: "27992017756", ig: "anaclara.d", checks: { seg: true, cur: true }, numbers: [{ n: 199, kind: "cadastro" }, { n: 64, kind: "extra", reason: "Indicou amigos", by: "Ana Costa" }], when: "2026-10-17T11:20:00-03:00" },
  { name: "Mariana Lopes", phone: "27997441290", ig: "mari.lopes", customer: "mariana-lopes", checks: { seg: true, cur: true }, numbers: [{ n: 88, kind: "cadastro" }], when: "2026-10-16T18:02:00-03:00" },
  { name: "Rafael Souza", phone: "27992106634", ig: "rafa.souza", customer: "rafael-souza-vv", checks: { seg: true, cur: true }, numbers: [{ n: 41, kind: "cadastro" }], when: "2026-10-16T19:15:00-03:00" },
  { name: "Lucas M.", phone: "27990099210", ig: "lucas_m_9921", checks: {}, numbers: [], excl: "Perfil duplicado", when: "2026-10-15T08:50:00-03:00" },
];

const FIRST = ["Bruno", "Camila", "Diego", "Elaine", "Fábio", "Gabriela", "Henrique", "Isabela", "Jorge", "Karina", "Leandro", "Marcela", "Nicolas", "Olívia", "Pedro", "Quézia", "Rodrigo", "Sabrina", "Tatiane", "Vitor"];
const LAST = ["Alves", "Barros", "Cardoso", "Dutra", "Esteves", "Freitas", "Gomes", "Hayashi", "Lima", "Moura"];

function filler(i: number, pool: number[], mix: { ok: number; pend: number }): Person {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const state = i < mix.ok ? "ok" : i < mix.ok + mix.pend ? "pend" : "excl";
  return {
    name,
    phone: `2798${String(1000000 + i * 37).padStart(7, "0")}`,
    ig: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${i}`,
    checks: state === "ok" ? { seg: true, cur: true } : state === "pend" && i % 2 ? { seg: true } : {},
    numbers: state === "excl" ? [] : [{ n: pool[i], kind: "cadastro" as const }],
    excl: state === "excl" ? "Perfil duplicado" : undefined,
    when: new Date(Date.parse("2026-10-12T12:00:00-03:00") + (i % 60) * 2.6 * 3_600_000).toISOString(),
  };
}

/** Distinct free numbers 1..max, skipping `skip`, deterministic. */
function pickPool(count: number, max: number, skip: Set<number>): number[] {
  const out: number[] = [];
  for (let i = 1; out.length < count; i++) {
    const n = ((i * 37) % max) + 1;
    if (!skip.has(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

export async function seedSorteios(db: Firestore, storeId: string): Promise<void> {
  const store = db.collection("stores").doc(storeId);

  // Start clean so re-running never keeps stale entries, numbers or leads.
  for (const col of ["raffleEntries", "raffleNumbers", "leads", "raffles"]) {
    await db.recursiveDelete(store.collection(col));
  }

  // Customers the leads link to (carla/mariana already exist in the base demo).
  const customers = [
    { id: "thiago-r", name: "Thiago R.", phone: "(27) 99734-2210", instagram: "thiagor", orderCount: 2, totalSpent: 7600 },
    { id: "rafael-souza-vv", name: "Rafael Souza", phone: "(27) 99210-6634", instagram: "rafa.souza", orderCount: 5, totalSpent: 21000 },
    { id: "paulo-henrique", name: "Paulo Henrique", phone: "(27) 99655-0381", instagram: "paulohs", orderCount: 2, totalSpent: 8400 },
  ];
  for (const c of customers) {
    await store.collection("customers").doc(c.id).set({
      name: c.name,
      nameLower: c.name.toLowerCase(),
      phone: c.phone,
      instagram: c.instagram,
      city: "Vila Velha/ES",
      tags: [],
      archived: false,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      since: ts("2023-03-01T12:00:00-03:00"),
      lastOrderAt: null,
      avgReorderDays: null,
    });
  }

  const common = {
    location: "Ao vivo no Instagram @selet.vv",
    pickup: "Retirada na loja em até 30 dias",
    notes: "",
    rules: RULES,
    fields: { instagram: true, birthday: false, email: false },
    createdAt: ts("2026-10-10T10:00:00-03:00"),
  };

  /* ---- 1. aberto ---- */
  const r1 = "demo-aniversario";
  await store.collection("raffles").doc(r1).set({
    ...common,
    name: "Aniversário Selet 3 anos",
    prize: "1 mês de shakes",
    slug: "aniversario-3-anos",
    status: "aberto",
    signupFrom: null,
    signupUntil: ts("2026-10-29T23:59:00-03:00"),
    drawAt: ts("2026-10-30T19:00:00-03:00"),
    numberFrom: 1,
    numberTo: 200,
    perPerson: 1,
    draws: [],
    winner: null,
    showResult: false,
    publishedAt: ts("2026-10-12T10:00:00-03:00"),
    regulamentoAt: ts("2026-10-18T10:00:00-03:00"),
  });
  await db.collection("raffleSlugs").doc("aniversario-3-anos").set({ storeId, raffleId: r1 });

  const named = new Set(NAMED.flatMap((p) => p.numbers.map((x) => x.n)));
  // 40 fillers: 31 validated, 7 pending, 2 excluded (totals: 36 ok · 9 pend · 3 excl = 48).
  const pool = pickPool(38 + 4, 200, new Set([...named, 10]));
  const fillers = Array.from({ length: 40 }, (_, i) => filler(i, pool, { ok: 31, pend: 7 }));
  // 4 fillers also got a bonus number → 52 numbers in total.
  [0, 5, 9, 14].forEach((idx, k) => {
    fillers[idx].numbers.push({ n: pool[38 + k], kind: "bonus", ruleId: "gru" });
    fillers[idx].checks = { ...fillers[idx].checks, gru: true };
  });
  await writePeople(db, storeId, r1, [...NAMED, ...fillers]);

  /* ---- 2. rascunho ---- */
  await store.collection("raffles").doc("demo-blackfriday").set({
    ...common,
    name: "Black Friday Selet",
    prize: "Kit 3 potes de shake + coqueteleira",
    slug: "black-friday",
    status: "rascunho",
    signupFrom: null,
    signupUntil: ts("2026-11-27T23:59:00-03:00"),
    drawAt: ts("2026-11-28T19:00:00-03:00"),
    numberFrom: 1,
    numberTo: 100,
    perPerson: 1,
    draws: [],
    winner: null,
    showResult: false,
    publishedAt: null,
    regulamentoAt: ts("2026-10-15T10:00:00-03:00"),
  });

  /* ---- 3. sorteado ---- */
  const r3 = "demo-criancas";
  const winnerPhone = "27996017733"; // Beatriz Almeida (customer from the base demo)
  await store.collection("raffles").doc(r3).set({
    ...common,
    name: "Dia das Crianças",
    prize: "4 pudins + 4 shakes kids",
    slug: "dia-das-criancas",
    status: "sorteado",
    signupFrom: null,
    signupUntil: ts("2026-10-11T23:59:00-03:00"),
    drawAt: ts("2026-10-12T19:00:00-03:00"),
    numberFrom: 1,
    numberTo: 200,
    perPerson: 1,
    draws: [
      { at: "19:02", text: "Nº 37 informado da live" },
      { at: "19:03", text: "Nº 37 confirmado como ganhador por Ana Costa" },
    ],
    winner: { number: 37, entryId: `${r3}_${winnerPhone}`, name: "Beatriz Almeida" },
    showResult: true,
    publishedAt: ts("2026-10-01T10:00:00-03:00"),
    regulamentoAt: ts("2026-10-01T10:00:00-03:00"),
  });
  await db.collection("raffleSlugs").doc("dia-das-criancas").set({ storeId, raffleId: r3 });
  const kids: Person[] = [
    { name: "Beatriz Almeida", phone: winnerPhone, ig: "bia.almeida", customer: "beatriz-almeida", checks: { seg: true, cur: true }, numbers: [{ n: 37, kind: "cadastro" }], when: "2026-10-05T10:00:00-03:00" },
    { name: "Paulo Henrique", phone: "27996550381", ig: "paulohs", customer: "paulo-henrique", checks: { seg: true, cur: true }, numbers: [{ n: 12, kind: "cadastro" }], when: "2026-10-09T10:00:00-03:00" },
    { name: "Renata Lima", phone: "27988772143", ig: "renatalima", checks: { seg: true, cur: true }, numbers: [{ n: 18, kind: "cadastro" }], when: "2026-10-04T10:00:00-03:00" },
    { name: "Carla Menezes", phone: "27998124471", ig: "carlamenezes", customer: "carla-menezes", checks: { seg: true, cur: true }, numbers: [{ n: 140, kind: "cadastro" }], when: "2026-10-03T10:00:00-03:00" },
    { name: "Ana Clara Dias", phone: "27992017756", ig: "anaclara.d", checks: { seg: true, cur: true }, numbers: [{ n: 95, kind: "cadastro" }], when: "2026-10-03T12:00:00-03:00" },
  ];
  const kidsPool = pickPool(59, 200, new Set([37, 12, 18, 140, 95]));
  const kidsFill = Array.from({ length: 59 }, (_, i) => {
    const p = filler(i, kidsPool, { ok: 59, pend: 0 });
    return { ...p, phone: `2798${String(3000000 + i * 41).padStart(7, "0")}`, ig: `${p.ig}k`, numbers: [{ n: kidsPool[i], kind: "cadastro" as const }] };
  });
  await writePeople(db, storeId, r3, [...kids, ...kidsFill]);
}

async function writePeople(
  db: Firestore,
  storeId: string,
  raffleId: string,
  people: Person[],
) {
  const store = db.collection("stores").doc(storeId);
  const obr = RULES.filter((r) => r.type === "obr");
  for (const p of people) {
    const id = `${raffleId}_${p.phone}`;
    const when = ts(p.when);
    const status = p.excl ? "excl" : obr.every((r) => p.checks[r.id]) ? "ok" : "pend";
    await store.collection("raffleEntries").doc(id).set({
      raffleId,
      name: p.name,
      phone: p.phone,
      instagram: p.ig,
      email: null,
      birthday: null,
      novidades: p.name.length % 2 === 0,
      createdAt: when,
      regulamentoAt: when,
      checks: p.checks,
      waived: {},
      status,
      exclReason: p.excl ?? null,
      numbers: p.numbers.map((n) => ({ ...n, at: p.when })),
      slots: (p.slots ?? []).map((s) => ({ ...s, at: p.when })),
      customerId: p.customer ?? null,
      token: `demo${id}`.replace(/[^a-z0-9]/gi, "").padEnd(32, "0").slice(0, 32),
    });
    for (const n of p.numbers) {
      await store.collection("raffleNumbers").doc(`${raffleId}_${n.n}`).set({ raffleId, entryId: id, n: n.n });
    }
    const leadRef = store.collection("leads").doc(p.phone);
    const existing = await leadRef.get();
    const kind = p.customer ? (p.customer === "paulo-henrique" ? "cli" : "vinc") : "novo";
    await leadRef.set(
      {
        name: p.name,
        phone: p.phone,
        instagram: p.ig,
        email: null,
        novidades: p.name.length % 2 === 0,
        raffleIds: Array.from(new Set([...(existing.data()?.raffleIds ?? []), raffleId])),
        createdAt: existing.exists ? existing.data()!.createdAt : when,
        lastAt: existing.exists && existing.data()!.lastAt.toMillis() > when.toMillis() ? existing.data()!.lastAt : when,
        kind,
        customerId: p.customer ?? null,
      },
      { merge: true },
    );
  }
}
