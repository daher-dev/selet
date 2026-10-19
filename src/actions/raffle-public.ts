"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import {
  DuplicateEntryError,
  NumberTakenError,
  checkProof,
  getEntryByPhone,
  getEntryByToken,
  getKnownProfile,
  getPublicRaffle,
  lookupPhone,
  pickOwnSlots,
  registerEntry,
  requestCode,
  verifyCode,
  type PublicRaffle,
} from "@/data/raffles";
import { normalizePhone, publicEntryView, type PublicEntryView } from "@/lib/raffles";
import { canSendWhatsApp } from "@/lib/whatsapp";

/**
 * Server Functions for the public sorteio link. NO login here by design:
 * everything is validated on the server and the person is identified only by
 * the random token in their cookie (set when they register or confirm the
 * WhatsApp code). Never trust the client with phones, tokens or entries.
 */

export type PublicResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; taken?: number; dup?: boolean };

const fail = (error: string, extra: { taken?: number; dup?: boolean } = {}) =>
  ({ ok: false, error, ...extra }) as const;

const tokenCookie = (raffleId: string) => `sorteio_${raffleId}`;
const proofCookie = (raffleId: string) => `sorteio_proof_${raffleId}`;

async function setCookie(name: string, value: string, maxAgeSec: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });
}

const DAY = 86_400;
/** Remember the device until the raffle is long over. */
const rememberFor = (pub: PublicRaffle) =>
  Math.max(DAY, Math.ceil((new Date(pub.raffle.drawAt).getTime() - Date.now()) / 1000) + 30 * DAY);

async function load(slug: string): Promise<PublicRaffle | null> {
  const pub = await getPublicRaffle(slug);
  return pub && pub.state !== "indisponivel" ? pub : null;
}

const NOT_OPEN = "Esse sorteio não está aceitando cadastros.";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Algo deu errado. Tente de novo.";
}

/* ---------------------------------------------------------------- step 1 -- */

export type StartKind = "new" | "known" | "dup";

export async function startAction(
  slug: string,
  phoneInput: string,
): Promise<PublicResult<{ kind: StartKind; phoneEnd: string; resendIn: number }>> {
  try {
    const phone = normalizePhone(phoneInput);
    if (!phone) return fail("Número incompleto: DDD + 9 dígitos, como (27) 9 9912-4432.");
    const pub = await load(slug);
    if (!pub || pub.state !== "aberto") return fail(NOT_OPEN);
    const found = await lookupPhone(pub, phone);
    const phoneEnd = phone.slice(-4);
    if (found.hasEntry) return { ok: true, kind: "dup", phoneEnd, resendIn: 0 };
    // Without a way to deliver the code, a known number just signs up like a new one
    // (nothing is prefilled or revealed), instead of dead-ending at a code nobody gets.
    if (!found.known || !canSendWhatsApp()) return { ok: true, kind: "new", phoneEnd, resendIn: 0 };
    const { resendIn } = await requestCode(pub, phone);
    return { ok: true, kind: "known", phoneEnd, resendIn };
  } catch (err) {
    return fail(errMessage(err));
  }
}

/** Sends a login code. Answers the same whether or not the number is known. */
export async function sendCodeAction(
  slug: string,
  phoneInput: string,
): Promise<PublicResult<{ phoneEnd: string; resendIn: number }>> {
  try {
    const phone = normalizePhone(phoneInput);
    if (!phone) return fail("Número incompleto: DDD + 9 dígitos, como (27) 9 9912-4432.");
    const pub = await load(slug);
    if (!pub) return fail("Esse sorteio não está disponível.");
    if (!canSendWhatsApp()) {
      return fail("Ainda não conseguimos enviar o código por WhatsApp. Fale com a loja para ver seus números.");
    }
    const found = await lookupPhone(pub, phone);
    let resendIn = 30;
    if (found.known) resendIn = (await requestCode(pub, phone)).resendIn;
    return { ok: true, phoneEnd: phone.slice(-4), resendIn };
  } catch (err) {
    return fail(errMessage(err));
  }
}

export async function verifyCodeAction(
  slug: string,
  phoneInput: string,
  code: string,
): Promise<
  PublicResult<{
    profile: { name: string; instagram: string; novidades: boolean } | null;
    entry: PublicEntryView | null;
  }>
> {
  try {
    const phone = normalizePhone(phoneInput);
    if (!phone || !/^\d{6}$/.test(code)) return fail("Digite os 6 dígitos do código.");
    const pub = await load(slug);
    if (!pub) return fail("Esse sorteio não está disponível.");
    const { proof } = await verifyCode(pub, phone, code);
    await setCookie(proofCookie(pub.raffle.id), `${phone}.${proof}`, 30 * 60);
    const entry = await getEntryByPhone(pub.storeId, pub.raffle.id, phone);
    if (entry) {
      await setCookie(tokenCookie(pub.raffle.id), entry.token, rememberFor(pub));
      return { ok: true, profile: null, entry: publicEntryView(pub.raffle, entry) };
    }
    return { ok: true, profile: await getKnownProfile(pub.storeId, phone), entry: null };
  } catch (err) {
    return fail(errMessage(err));
  }
}

/* --------------------------------------------------------------- register -- */

const registerSchema = z.object({
  phone: z.string(),
  name: z.string().trim().min(2, "Conte seu nome para a gente te chamar se ganhar.").max(80),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, "").replace(/\s/g, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9._]{1,30}$/.test(v), "Instagram inválido."),
  novidades: z.boolean(),
  aceite: z.literal(true, "Aceite o regulamento para participar."),
  picks: z.array(z.number().int()).min(1).max(10),
  /** Honeypot: real people never fill this hidden field. */
  website: z.string().max(0).optional(),
});

export type RegisterPayload = z.input<typeof registerSchema>;

export async function registerAction(
  slug: string,
  payload: RegisterPayload,
): Promise<PublicResult<{ entry: PublicEntryView }>> {
  try {
    const input = registerSchema.parse(payload);
    const phone = normalizePhone(input.phone);
    if (!phone) return fail("WhatsApp inválido.");
    const pub = await load(slug);
    if (!pub || pub.state !== "aberto") return fail(NOT_OPEN);
    if (pub.raffle.fields.instagram && !input.instagram) {
      return fail("Precisamos do seu @ para conferir as regras.");
    }

    const found = await lookupPhone(pub, phone);
    if (found.hasEntry) return fail("Esse WhatsApp já participa deste sorteio.", { dup: true });
    if (found.known && canSendWhatsApp()) {
      // A returning person must prove the number is theirs before we reuse their data.
      const jar = await cookies();
      const [p, proof] = (jar.get(proofCookie(pub.raffle.id))?.value ?? "").split(".");
      if (p !== phone || !(await checkProof(pub.raffle.id, phone, proof ?? ""))) {
        return fail("Confirme o código que enviamos no seu WhatsApp.");
      }
    }

    const entry = await registerEntry(pub, {
      phone,
      name: input.name,
      instagram: input.instagram,
      novidades: input.novidades,
      picks: input.picks,
    });
    await setCookie(tokenCookie(pub.raffle.id), entry.token, rememberFor(pub));
    return { ok: true, entry: publicEntryView(pub.raffle, entry) };
  } catch (err) {
    if (err instanceof NumberTakenError) return fail(err.message, { taken: err.number });
    if (err instanceof DuplicateEntryError) return fail(err.message, { dup: true });
    if (err instanceof z.ZodError) return fail(err.issues[0]?.message ?? "Dados inválidos.");
    return fail(errMessage(err));
  }
}

/* ------------------------------------------------------ bonus / my numbers -- */

export async function pickBonusAction(
  slug: string,
  picks: number[],
): Promise<PublicResult<{ entry: PublicEntryView }>> {
  try {
    const pub = await load(slug);
    if (!pub) return fail("Esse sorteio não está disponível.");
    const token = (await cookies()).get(tokenCookie(pub.raffle.id))?.value ?? "";
    await pickOwnSlots(pub.storeId, pub.raffle.id, token, z.array(z.number().int()).max(10).parse(picks));
    const entry = await getEntryByToken(pub.storeId, pub.raffle.id, token);
    if (!entry) return fail("Link inválido. Peça um novo à loja.");
    return { ok: true, entry: publicEntryView(pub.raffle, entry) };
  } catch (err) {
    if (err instanceof NumberTakenError) return fail(err.message, { taken: err.number });
    return fail(errMessage(err));
  }
}

/** Opens a bonus/extra link (?t=…) on this device: remembers the person. */
export async function adoptTokenAction(slug: string, token: string): Promise<PublicResult> {
  try {
    const pub = await load(slug);
    if (!pub) return fail("Esse sorteio não está disponível.");
    const entry = await getEntryByToken(pub.storeId, pub.raffle.id, token);
    if (!entry) return fail("Link inválido. Peça um novo à loja.");
    await setCookie(tokenCookie(pub.raffle.id), entry.token, rememberFor(pub));
    return { ok: true };
  } catch (err) {
    return fail(errMessage(err));
  }
}
