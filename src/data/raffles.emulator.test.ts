import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/firebase-admin";
import type { RaffleRule } from "@/lib/raffles";
import { createCustomer, getCustomer } from "./customers";
import {
  DuplicateEntryError,
  NumberTakenError,
  announceResult,
  checkProof,
  confirmWinner,
  convertLeadToCustomer,
  countPendingEntries,
  excludeEntry,
  getEntryByToken,
  getPublicRaffle,
  grantExtraNumbers,
  linkLeadToCustomer,
  listEntries,
  listLeads,
  listRaffles,
  lookupPhone,
  pickOwnSlots,
  pickSlotNumbersAdmin,
  publishRaffle,
  registerEntry,
  removeEntryNumber,
  requestCode,
  saveRaffle,
  setRuleCheck,
  setSignupsOpen,
  verifyCode,
  waiveRule,
  type PublicRaffle,
  type RaffleInput,
} from "./raffles";

const hasEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

const rules: RaffleRule[] = [
  { id: "seg", text: "Seguir @selet.vv", type: "obr" },
  { id: "cur", text: "Curtir o post", type: "obr" },
  { id: "gru", text: "Convidar alguém", type: "bonus" },
];

const day = 86_400_000;
const input = (slug: string, over: Partial<RaffleInput> = {}): RaffleInput => ({
  name: "Aniversário Selet 3 anos",
  prize: "1 mês de shakes",
  location: "Ao vivo no Instagram @selet.vv",
  pickup: "Retirada na loja em até 30 dias",
  notes: "",
  slug,
  signupFrom: null,
  signupUntil: new Date(Date.now() + 5 * day).toISOString(),
  drawAt: new Date(Date.now() + 6 * day).toISOString(),
  numberFrom: 1,
  numberTo: 20,
  perPerson: 1,
  rules,
  fields: { instagram: true, birthday: false, email: false },
  ...over,
});

describe.skipIf(!hasEmulator)("raffles repository (emulator)", () => {
  const storeId = `test-raffles-${Date.now()}`;
  const slug = `sorteio-${Date.now()}`;
  let raffleId: string;
  let pub: PublicRaffle;

  const phoneN = (i: number) => `279${String(10_000_000 + i)}`;
  const person = (i: number, picks: number[], over = {}) => ({
    phone: phoneN(i),
    name: `Pessoa ${i}`,
    instagram: `pessoa${i}`,
    novidades: false,
    picks,
    ...over,
  });
  const refresh = async () => (pub = (await getPublicRaffle(slug))!);

  beforeAll(async () => {
    raffleId = await saveRaffle(storeId, null, input(slug));
  });

  it("starts as a draft that has no public link", async () => {
    expect(await getPublicRaffle(slug)).toBeNull();
    const [r] = await listRaffles(storeId);
    expect(r).toMatchObject({ id: raffleId, status: "rascunho", entryCount: 0 });
  });

  it("publishes once and claims the link globally", async () => {
    await publishRaffle(storeId, raffleId);
    await refresh();
    expect(pub.state).toBe("aberto");
    expect(pub.storeId).toBe(storeId);
    await expect(publishRaffle(storeId, raffleId)).rejects.toThrow(/já foi publicado/);

    const other = await saveRaffle(storeId, null, input(slug, { name: "Outro" }));
    await expect(publishRaffle(storeId, other)).rejects.toThrow(/já está em uso/);
  });

  it("locks the range and per-person limit after publishing", async () => {
    await saveRaffle(storeId, raffleId, input(slug, { numberTo: 999, perPerson: 5, prize: "Novo prêmio" }));
    await refresh();
    expect(pub.raffle.numberTo).toBe(20);
    expect(pub.raffle.perPerson).toBe(1);
    expect(pub.raffle.prize).toBe("Novo prêmio");
  });

  it("registers an entry, claims the number and creates the lead atomically", async () => {
    const entry = await registerEntry(pub, person(1, [7]));
    expect(entry).toMatchObject({ status: "pend", numbers: [{ n: 7, kind: "cadastro" }] });
    await refresh();
    expect(pub.taken).toEqual([7]);
    const leads = await listLeads(storeId);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ phone: phoneN(1), kind: "novo", raffleIds: [raffleId] });
  });

  it("rejects the same WhatsApp twice and the same number twice", async () => {
    await expect(registerEntry(pub, person(1, [8]))).rejects.toBeInstanceOf(DuplicateEntryError);
    const err = await registerEntry(pub, person(2, [7])).catch((e) => e);
    expect(err).toBeInstanceOf(NumberTakenError);
    expect(err.number).toBe(7);
    // nothing leaked from the failed attempt: no entry, no lead, number still only 7
    expect(await listEntries(storeId, raffleId)).toHaveLength(1);
    expect((await listLeads(storeId)).map((l) => l.phone)).toEqual([phoneN(1)]);
  });

  it("lets exactly one of several simultaneous sign-ups win a number", async () => {
    const results = await Promise.allSettled(
      [10, 11, 12, 13, 14].map((i) => registerEntry(pub, person(i, [15]))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(NumberTakenError);
    }
    expect(await listEntries(storeId, raffleId)).toHaveLength(2);
  });

  it("validates picks against the range and the per-person count", async () => {
    await expect(registerEntry(pub, person(3, [99]))).rejects.toThrow(/fora da faixa/);
    await expect(registerEntry(pub, person(3, [1, 2]))).rejects.toThrow(/Escolha um número/);
  });

  it("recomputes the situation when the team checks rules", async () => {
    const [mine] = (await listEntries(storeId, raffleId)).filter((e) => e.phone === phoneN(1));
    await setRuleCheck(storeId, mine.id, "seg", true);
    expect((await listEntries(storeId, raffleId)).find((e) => e.id === mine.id)?.status).toBe("pend");
    await waiveRule(storeId, mine.id, "cur", "Post apagado e repostado", "ana@selet.app");
    const after = (await listEntries(storeId, raffleId)).find((e) => e.id === mine.id)!;
    expect(after.status).toBe("ok");
    expect(after.waived.cur).toMatchObject({ by: "ana@selet.app", reason: "Post apagado e repostado" });
    await expect(waiveRule(storeId, mine.id, "gru", "x", "a")).rejects.toThrow(/obrigatórias/);
  });

  it("a checked bonus rule owes one number, chosen from the person's own link", async () => {
    const [mine] = (await listEntries(storeId, raffleId)).filter((e) => e.phone === phoneN(1));
    await setRuleCheck(storeId, mine.id, "gru", true);
    await setRuleCheck(storeId, mine.id, "gru", true); // idempotent
    let e = (await listEntries(storeId, raffleId)).find((x) => x.id === mine.id)!;
    expect(e.slots).toHaveLength(1);

    await expect(pickOwnSlots(storeId, raffleId, "token-errado-0000000000", [9])).rejects.toThrow(/Link inválido/);
    await expect(pickOwnSlots(storeId, raffleId, e.token, [7])).rejects.toBeInstanceOf(NumberTakenError);
    await pickOwnSlots(storeId, raffleId, e.token, [9]);
    e = (await getEntryByToken(storeId, raffleId, e.token))!;
    expect(e.slots).toHaveLength(0);
    expect(e.numbers.map((n) => [n.n, n.kind])).toEqual([[7, "cadastro"], [9, "bonus"]]);
    await expect(pickOwnSlots(storeId, raffleId, e.token, [10])).rejects.toThrow(/Não há números/);
  });

  it("extra numbers carry a reason and can be chosen by the store", async () => {
    const [mine] = (await listEntries(storeId, raffleId)).filter((e) => e.phone === phoneN(1));
    await grantExtraNumbers(storeId, mine.id, 2, "Trouxe 2 amigas à loja", "ana@selet.app");
    await pickSlotNumbersAdmin(storeId, mine.id, [3, 4], "ana@selet.app");
    const e = (await listEntries(storeId, raffleId)).find((x) => x.id === mine.id)!;
    expect(e.numbers.filter((n) => n.kind === "extra")).toMatchObject([
      { n: 3, reason: "Trouxe 2 amigas à loja", by: "ana@selet.app" },
      { n: 4 },
    ]);
  });

  it("removing a number or excluding someone frees it for others", async () => {
    const [mine] = (await listEntries(storeId, raffleId)).filter((e) => e.phone === phoneN(1));
    await removeEntryNumber(storeId, mine.id, 4);
    await refresh();
    expect(pub.taken).not.toContain(4);

    await excludeEntry(storeId, mine.id, "Perfil duplicado");
    await refresh();
    expect(pub.taken).not.toContain(7);
    expect(pub.taken).not.toContain(9);
    const e = (await listEntries(storeId, raffleId)).find((x) => x.id === mine.id)!;
    expect(e).toMatchObject({ status: "excl", exclReason: "Perfil duplicado", numbers: [] });
    // excluded people keep their lead, and the WhatsApp still can't enter twice
    await expect(registerEntry(pub, person(1, [7]))).rejects.toBeInstanceOf(DuplicateEntryError);
    await registerEntry(pub, person(30, [7]));
  });

  it("counts only people still waiting on the team", async () => {
    expect(await countPendingEntries(storeId)).toBeGreaterThan(0);
  });

  it("closes and reopens signups, never past the deadline", async () => {
    await setSignupsOpen(storeId, raffleId, false);
    await refresh();
    expect(pub.state).toBe("encerrado");
    await expect(registerEntry(pub, person(40, [11]))).rejects.toThrow(/não estão abertas/);
    await setSignupsOpen(storeId, raffleId, true);
    await refresh();
    expect(pub.state).toBe("aberto");
  });

  describe("WhatsApp login code", () => {
    const phone = phoneN(30);
    const devCode = async () =>
      (await getDb().collection("raffleCodes").doc(`${raffleId}_${phone}`).get()).data()!.devCode as string;

    it("recognises returning people without exposing their data", async () => {
      expect(await lookupPhone(pub, phone)).toEqual({ hasEntry: true, known: true });
      expect(await lookupPhone(pub, phoneN(999))).toEqual({ hasEntry: false, known: false });
    });

    it("verifies a code once, rate-limits resends and blocks guessing", async () => {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      await requestCode(pub, phone);
      expect(log.mock.calls[0][0]).toContain(await devCode());
      await expect(requestCode(pub, phone)).rejects.toThrow(/Aguarde/);

      for (let i = 0; i < 5; i++) {
        await expect(verifyCode(pub, phone, "000000")).rejects.toThrow(/incorreto|Muitas/);
      }
      await expect(verifyCode(pub, phone, await devCode())).rejects.toThrow(/Muitas tentativas/);
      log.mockRestore();
    });

    it("accepts the right code and returns a proof that only works for that phone", async () => {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      await getDb().collection("raffleCodes").doc(`${raffleId}_${phone}`).update({ sentAt: 0, attempts: 0 });
      await requestCode(pub, phone);
      const { proof } = await verifyCode(pub, phone, await devCode());
      expect(await checkProof(raffleId, phone, proof)).toBe(true);
      expect(await checkProof(raffleId, phoneN(31), proof)).toBe(false);
      expect(await checkProof(raffleId, phone, "outra")).toBe(false);
      // a used code cannot be replayed
      await expect(verifyCode(pub, phone, "123456")).rejects.toThrow();
      log.mockRestore();
    });
  });

  describe("draw", () => {
    it("only an entry that met the rules can win", async () => {
      const entries = await listEntries(storeId, raffleId);
      const pending = entries.find((e) => e.status === "pend")!;
      await expect(
        confirmWinner(storeId, raffleId, pending.numbers[0].n, [], "ana@selet.app"),
      ).rejects.toThrow(/ainda não cumpriu/);
      await expect(confirmWinner(storeId, raffleId, 20, [], "ana@selet.app")).rejects.toThrow(/Ninguém escolheu/);

      await setRuleCheck(storeId, pending.id, "seg", true);
      await setRuleCheck(storeId, pending.id, "cur", true);
      await confirmWinner(
        storeId,
        raffleId,
        pending.numbers[0].n,
        [{ at: "19:02", text: "Nº informado da live" }],
        "ana@selet.app",
      );
      await refresh();
      expect(pub.raffle.status).toBe("sorteado");
      expect(pub.raffle.winner).toMatchObject({ number: pending.numbers[0].n, name: pending.name });
      expect(pub.raffle.draws.at(-1)?.text).toContain("ana@selet.app");
      expect(pub.state).toBe("encerrado");
      await expect(
        confirmWinner(storeId, raffleId, pending.numbers[0].n, [], "x"),
      ).rejects.toThrow(/já foi realizado/);
    });

    it("publishing the result makes the link show it; WhatsApp failures do not undo it", async () => {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const out = await announceResult(storeId, raffleId, { showResult: true, notifyWinner: true, notifyAll: false });
      expect(out).toEqual({ sent: 1, failed: 0 });
      await refresh();
      expect(pub.state).toBe("resultado");
      log.mockRestore();
    });
  });

  describe("leads", () => {
    it("links to an existing customer or converts into a new one", async () => {
      const entries = await listEntries(storeId, raffleId);
      const [a, b] = entries.filter((e) => e.status !== "excl");
      const customerId = await createCustomer(storeId, { name: "Cliente Antigo", phone: "(27) 99100-0000", tags: [] });
      await linkLeadToCustomer(storeId, a.phone, customerId);
      const converted = await convertLeadToCustomer(storeId, b.phone);
      expect(await getCustomer(storeId, converted)).toMatchObject({ name: b.name, instagram: b.instagram });

      const leads = await listLeads(storeId);
      expect(leads.find((l) => l.phone === a.phone)).toMatchObject({ kind: "vinc", customerId });
      expect(leads.find((l) => l.phone === b.phone)).toMatchObject({ kind: "cli", customerId: converted });
      expect((await listEntries(storeId, raffleId)).find((e) => e.id === b.id)?.customerId).toBe(converted);
      await expect(convertLeadToCustomer(storeId, b.phone)).rejects.toThrow(/já está ligado/);
    });
  });
});
