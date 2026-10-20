import { describe, expect, it } from "vitest";
import {
  abbreviateName,
  buildRegulamento,
  deriveStatus,
  finalizeRule,
  formatDrawAt,
  formatWhen,
  linkState,
  maskWhatsapp,
  missingBonusSlots,
  missingRules,
  normalizePhone,
  pickProblem,
  publishProblem,
  type Raffle,
  type RaffleRule,
} from "./raffles";

const rules: RaffleRule[] = [
  { id: "seg", text: "Seguir @selet.vv", type: "obr" },
  { id: "cur", text: "Curtir o post", type: "obr" },
  { id: "gru", text: "Convidar alguém", type: "bonus" },
];

const raffle = (over: Partial<Raffle> = {}): Raffle => ({
  id: "r1",
  name: "Aniversário Selet 3 anos",
  prize: "1 mês de shakes",
  location: "Ao vivo no Instagram @selet.vv",
  pickup: "Retirada na loja em até 30 dias",
  notes: "",
  slug: "aniversario-3-anos",
  status: "aberto",
  signupFrom: null,
  signupUntil: "2026-10-29T23:59:00-03:00",
  drawAt: "2026-10-30T19:00:00-03:00",
  numberFrom: 1,
  numberTo: 200,
  perPerson: 1,
  rules,
  fields: { instagram: true, birthday: false, email: false },
  draws: [],
  winner: null,
  showResult: false,
  publishedAt: "2026-10-18T10:00:00-03:00",
  regulamentoAt: "2026-10-18T10:00:00-03:00",
  createdAt: "2026-10-17T10:00:00-03:00",
  ...over,
});

describe("normalizePhone", () => {
  it("accepts DDD + 9 digits in any format, with or without +55", () => {
    expect(normalizePhone("(27) 9 9912-4432")).toBe("27999124432");
    expect(normalizePhone("+55 27 99912-4432")).toBe("27999124432");
    expect(normalizePhone("27999124432")).toBe("27999124432");
  });
  it("rejects short, landline-style and garbage input", () => {
    expect(normalizePhone("(27) 9912-44")).toBeNull();
    expect(normalizePhone("2733124432")).toBeNull();
    expect(normalizePhone("27899124432")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("maskWhatsapp", () => {
  it("masks progressively", () => {
    expect(maskWhatsapp("2")).toBe("(2");
    expect(maskWhatsapp("27")).toBe("(27");
    expect(maskWhatsapp("279")).toBe("(27) 9");
    expect(maskWhatsapp("27999")).toBe("(27) 9 99");
    expect(maskWhatsapp("27999124432999")).toBe("(27) 9 9912-4432");
  });
});

describe("entry status", () => {
  it("needs every obligatory rule checked or waived; bonus never blocks", () => {
    const base = { checks: {}, waived: {}, status: "pend" as const };
    expect(deriveStatus(rules, base)).toBe("pend");
    expect(missingRules(rules, base).map((r) => r.id)).toEqual(["seg", "cur"]);
    expect(deriveStatus(rules, { ...base, checks: { seg: true, cur: true } })).toBe("ok");
    expect(
      deriveStatus(rules, {
        ...base,
        checks: { seg: true },
        waived: { cur: { by: "a@b", at: "x", reason: "post apagado" } },
      }),
    ).toBe("ok");
  });
  it("keeps an excluded entry excluded", () => {
    expect(
      deriveStatus(rules, { checks: { seg: true, cur: true }, waived: {}, status: "excl" }),
    ).toBe("excl");
  });
  it("owes a number for each checked bonus rule until it is chosen or pending", () => {
    const e = { checks: { gru: true }, numbers: [], slots: [] };
    expect(missingBonusSlots(rules, e).map((r) => r.id)).toEqual(["gru"]);
    expect(
      missingBonusSlots(rules, { ...e, slots: [{ kind: "bonus", ruleId: "gru", at: "x" }] }),
    ).toEqual([]);
    expect(
      missingBonusSlots(rules, {
        ...e,
        numbers: [{ n: 9, kind: "bonus", ruleId: "gru", at: "x" }],
      }),
    ).toEqual([]);
    expect(missingBonusSlots(rules, { ...e, checks: {} })).toEqual([]);
  });
});

describe("linkState", () => {
  const now = new Date("2026-10-20T12:00:00-03:00");
  it("walks the public states", () => {
    expect(linkState(raffle(), 148, now)).toBe("aberto");
    expect(linkState(raffle({ status: "rascunho" }), 148, now)).toBe("indisponivel");
    expect(linkState(raffle({ signupFrom: "2026-10-25T09:00:00-03:00" }), 148, now)).toBe("naoAbriu");
    expect(linkState(raffle({ signupUntil: "2026-10-19T23:59:00-03:00" }), 148, now)).toBe("encerrado");
    expect(linkState(raffle({ status: "encerrado" }), 148, now)).toBe("encerrado");
    expect(linkState(raffle(), 0, now)).toBe("esgotado");
  });
  it("shows the result only when published", () => {
    const winner = { number: 88, entryId: "e", name: "Mariana Lopes" };
    expect(linkState(raffle({ status: "sorteado", winner }), 0, now)).toBe("encerrado");
    expect(linkState(raffle({ status: "sorteado", winner, showResult: true }), 0, now)).toBe("resultado");
  });
});

describe("validation", () => {
  const draft = {
    name: "Black Friday",
    numberFrom: 1,
    numberTo: 100,
    perPerson: 1,
    rules,
    signupUntil: "2026-11-27T23:59:00-03:00",
    drawAt: "2026-11-28T19:00:00-03:00",
  };
  it("accepts a sane draft", () => expect(publishProblem(draft)).toBeNull());
  it("blocks the usual mistakes", () => {
    expect(publishProblem({ ...draft, name: " " })).toMatch(/nome/);
    expect(publishProblem({ ...draft, numberFrom: 50, numberTo: 10 })).toMatch(/invertida/);
    expect(publishProblem({ ...draft, numberTo: 2, perPerson: 3 })).toMatch(/menos números/);
    expect(publishProblem({ ...draft, rules: [{ id: "x", text: " ", type: "obr" }] })).toMatch(/regras vazias/);
    expect(publishProblem({ ...draft, drawAt: "2026-11-01T19:00:00-03:00" })).toMatch(/antes/);
  });
  it("checks picks against the range and the expected count", () => {
    const r = { numberFrom: 1, numberTo: 200 };
    expect(pickProblem(r, [23], 1)).toBeNull();
    expect(pickProblem(r, [], 1)).toMatch(/Escolha/);
    expect(pickProblem(r, [23, 23], 2)).toMatch(/diferentes/);
    expect(pickProblem(r, [201], 1)).toMatch(/fora da faixa/);
    expect(pickProblem(r, [1, 2], 3)).toBe("Escolha 3 números.");
  });
});

describe("display helpers", () => {
  it("abbreviates names for the public result", () => {
    expect(abbreviateName("Mariana Lopes")).toBe("Mariana L.");
    expect(abbreviateName("Ana Clara Dias")).toBe("Ana D.");
    expect(abbreviateName("Madonna")).toBe("Madonna");
  });
  it("formats the draw date in store time", () => {
    expect(formatDrawAt("2026-10-30T22:00:00Z")).toBe("30/10 · 19h");
    expect(formatDrawAt("2026-10-30T22:30:00Z")).toBe("30/10 · 19h30");
  });
  it("labels sign-up times relative to today in store time", () => {
    const now = new Date("2026-10-19T15:00:00-03:00");
    expect(formatWhen("2026-10-19T10:12:00-03:00", now)).toBe("hoje 10:12");
    expect(formatWhen("2026-10-18T23:59:00-03:00", now)).toBe("ontem");
    expect(formatWhen("2026-10-17T09:00:00-03:00", now)).toBe("17/10");
    // 01:00 UTC on the 20th is still the 19th in Brazil
    expect(formatWhen("2026-10-20T01:00:00Z", now)).toBe("hoje 22:00");
  });
  it("generates the regulamento from raffle data", () => {
    const text = buildRegulamento(raffle(), { name: "Vila Velha/ES" })
      .flatMap((s) => [s.title, ...s.lines])
      .join("\n");
    expect(text).toContain("de 1 a 200");
    expect(text).toContain("Seguir @selet.vv; Curtir o post");
    expect(text).toContain("Convidar alguém vale +1 número");
    expect(text).toContain("[RAZÃO SOCIAL]");
    expect(text).toContain("fale com [CONTATO]");
    expect(
      buildRegulamento(raffle(), { name: "x", contact: "(27) 99999-0000" })
        .flatMap((s) => s.lines)
        .join("\n"),
    ).toContain("fale com (27) 99999-0000");
    expect(text).not.toContain("Observações da loja");
    expect(
      buildRegulamento(raffle({ notes: "Só maiores de 18" }), { name: "x", contact: "(27) 99999-0000" }).at(-1)?.lines,
    ).toEqual(["Só maiores de 18"]);
  });
});

describe("typed Instagram rules", () => {
  const base = { id: "x", text: "", type: "obr" as const };
  it("follow accepts @, bare handle or profile URL and sends to the profile", () => {
    for (const link of ["@selet.vv", "selet.vv", "https://www.instagram.com/selet.vv/?hl=pt"]) {
      expect(finalizeRule({ ...base, kind: "follow", link })).toEqual({
        id: "x", type: "obr", kind: "follow", link: "https://instagram.com/selet.vv", text: "Seguir @selet.vv",
      });
    }
  });
  it("like/comment need a post URL and are normalized", () => {
    expect(finalizeRule({ ...base, kind: "like", link: "instagram.com/selet.vv/reels/Cx_1-a?igsh=1" })).toMatchObject({
      link: "https://www.instagram.com/reel/Cx_1-a/", text: "Curtir o post",
    });
    expect(finalizeRule({ ...base, kind: "comment", link: "https://instagram.com/p/AbC/" })).toMatchObject({ text: "Comentar no post" });
  });
  it("rejects missing or foreign links; custom rules pass through", () => {
    expect(finalizeRule({ ...base, kind: "follow", link: "https://evil.com/x" })).toMatch(/@/);
    expect(finalizeRule({ ...base, kind: "follow", link: "instagram.com/p/AbC" })).toMatch(/@/);
    expect(finalizeRule({ ...base, kind: "like", link: "@selet.vv" })).toMatch(/post/);
    expect(finalizeRule({ ...base, text: "Convidar 1 amigo", link: "x" })).toEqual({ id: "x", type: "obr", text: "Convidar 1 amigo" });
  });
});
