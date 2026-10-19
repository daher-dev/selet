import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAction, sendCodeAction, startAction } from "./raffle-public";

const data = vi.hoisted(() => ({
  getPublicRaffle: vi.fn(),
  lookupPhone: vi.fn(),
  requestCode: vi.fn(),
  registerEntry: vi.fn(),
  checkProof: vi.fn(),
}));
const wa = vi.hoisted(() => ({ canSend: true }));

vi.mock("@/data/raffles", () => ({
  ...data,
  DuplicateEntryError: class extends Error {},
  NumberTakenError: class extends Error {
    number = 0;
  },
  getEntryByPhone: vi.fn(),
  getEntryByToken: vi.fn(),
  getKnownProfile: vi.fn(),
  pickOwnSlots: vi.fn(),
  verifyCode: vi.fn(),
}));
vi.mock("@/lib/whatsapp", () => ({ canSendWhatsApp: () => wa.canSend }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), has: () => false }),
}));

const pub = {
  storeId: "s1",
  state: "aberto",
  taken: [],
  raffle: {
    id: "r1",
    status: "aberto",
    numberFrom: 1,
    numberTo: 20,
    perPerson: 1,
    drawAt: "2026-10-30T19:00:00-03:00",
    regulamentoAt: "2026-10-18T10:00:00-03:00",
    fields: { instagram: true, birthday: false, email: false },
    rules: [],
  },
};

const signup = { phone: "(27) 9 9999-0001", name: "Ana Souza", instagram: "anasouza", novidades: false, aceite: true as const, picks: [5] };

beforeEach(() => {
  vi.clearAllMocks();
  wa.canSend = true;
  data.getPublicRaffle.mockResolvedValue(pub);
  data.registerEntry.mockResolvedValue({ name: "Ana Souza", instagram: "anasouza", phone: "27999990001", token: "t".repeat(32), numbers: [{ n: 5, kind: "cadastro" }], slots: [], checks: {}, waived: {}, status: "pend" });
});

describe("public sign-up without WhatsApp delivery", () => {
  it("a customer's number goes straight to the short sign-up: no code is requested", async () => {
    wa.canSend = false;
    data.lookupPhone.mockResolvedValue({ hasEntry: false, known: true });
    const res = await startAction("s", "(27) 9 9999-0001");
    expect(res).toMatchObject({ ok: true, kind: "new" });
    expect(data.requestCode).not.toHaveBeenCalled();
  });

  it("a returning customer can finish the sign-up without a code proof", async () => {
    wa.canSend = false;
    data.lookupPhone.mockResolvedValue({ hasEntry: false, known: true });
    const res = await registerAction("s", signup);
    expect(res.ok).toBe(true);
    expect(data.checkProof).not.toHaveBeenCalled();
    expect(data.registerEntry).toHaveBeenCalled();
  });

  it("a number already in the raffle still gets the duplicate answer", async () => {
    wa.canSend = false;
    data.lookupPhone.mockResolvedValue({ hasEntry: true, known: true });
    expect(await startAction("s", "(27) 9 9999-0001")).toMatchObject({ ok: true, kind: "dup" });
    expect(await registerAction("s", signup)).toMatchObject({ ok: false, dup: true });
  });

  it("asking for a code explains it is unavailable instead of failing on send", async () => {
    wa.canSend = false;
    const res = await sendCodeAction("s", "(27) 9 9999-0001");
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("Fale com a loja") });
    expect(data.requestCode).not.toHaveBeenCalled();
  });
});

describe("public sign-up with WhatsApp delivery", () => {
  it("a customer's number is sent a code, and registering needs the proof", async () => {
    data.lookupPhone.mockResolvedValue({ hasEntry: false, known: true });
    data.requestCode.mockResolvedValue({ resendIn: 30 });
    expect(await startAction("s", "(27) 9 9999-0001")).toMatchObject({ ok: true, kind: "known", resendIn: 30 });

    data.checkProof.mockResolvedValue(false);
    const res = await registerAction("s", signup);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("código") });
    expect(data.registerEntry).not.toHaveBeenCalled();
  });
});
