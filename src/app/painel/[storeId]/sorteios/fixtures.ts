import type { Raffle, RaffleEntry, RaffleRule } from "@/lib/raffles";

export const RULES: RaffleRule[] = [
  { id: "seg", text: "Seguir @selet.vv", type: "obr" },
  { id: "cur", text: "Curtir o post", type: "obr" },
  { id: "gru", text: "Convidar para o grupo", type: "bonus" },
];

export function raffle(over: Partial<Raffle> = {}): Raffle {
  return {
    id: "r1",
    name: "Aniversário Selet 3 anos",
    prize: "1 mês de shakes",
    location: "Ao vivo no Instagram @selet.vv",
    pickup: "Retirada na loja",
    notes: "",
    slug: "aniversario-3-anos",
    status: "aberto",
    signupFrom: null,
    signupUntil: "2026-10-29T23:59:00-03:00",
    drawAt: "2026-10-30T19:00:00-03:00",
    numberFrom: 1,
    numberTo: 200,
    perPerson: 1,
    rules: RULES,
    fields: { instagram: true, birthday: false, email: false },
    draws: [],
    winner: null,
    showResult: false,
    publishedAt: "2026-10-18T10:00:00-03:00",
    regulamentoAt: "2026-10-18T10:00:00-03:00",
    createdAt: "2026-10-17T10:00:00-03:00",
    ...over,
  };
}

export function entry(over: Partial<RaffleEntry> = {}): RaffleEntry {
  return {
    id: "r1_27999990001",
    raffleId: "r1",
    name: "Juliana Prado",
    phone: "27999990001",
    instagram: "juprado",
    novidades: false,
    createdAt: "2026-10-19T10:12:00-03:00",
    checks: {},
    waived: {},
    status: "pend",
    numbers: [{ n: 23, kind: "cadastro", at: "2026-10-19T10:12:00-03:00" }],
    slots: [],
    customerId: null,
    token: "t".repeat(32),
    ...over,
  };
}
