"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { logActivity } from "@/data/activity";
import {
  announceResult,
  confirmWinner,
  convertLeadToCustomer,
  excludeEntry,
  grantExtraNumbers,
  linkLeadToCustomer,
  pickSlotNumbersAdmin,
  publishRaffle,
  removeEntryNumber,
  saveRaffle,
  setRuleCheck,
  setSignupsOpen,
  waiveRule,
} from "@/data/raffles";
import { MAX_PER_PERSON } from "@/lib/raffles";
import type { ActionResult } from "./products";

const dateTime = z.iso.datetime({ offset: true });

const ruleSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().max(140),
  type: z.enum(["obr", "bonus"]),
});

const raffleSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(1, "Dê um nome ao sorteio.").max(80),
  prize: z.string().trim().min(1, "Informe o prêmio.").max(140),
  location: z.string().trim().max(140),
  pickup: z.string().trim().max(140),
  notes: z.string().trim().max(1000),
  slug: z.string().trim().min(2, "Informe o endereço do link.").max(60),
  signupFrom: dateTime.nullable(),
  signupUntil: dateTime,
  drawAt: dateTime,
  numberFrom: z.number().int().min(1, "A faixa começa em 1 ou mais."),
  numberTo: z.number().int().max(10_000, "No máximo 10.000 números."),
  perPerson: z.number().int().min(1).max(MAX_PER_PERSON),
  rules: z.array(ruleSchema).max(12),
  fields: z.object({
    instagram: z.boolean(),
    birthday: z.boolean(),
    email: z.boolean(),
  }),
});

export type RaffleFormInput = z.input<typeof raffleSchema>;

type Result<T extends object = object> = ActionResult & Partial<T>;

async function run<T extends object>(fn: () => Promise<T | void>): Promise<Result<T>> {
  try {
    return { ok: true, ...((await fn()) ?? {}) } as Result<T>;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." } as Result<T>;
    }
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." } as Result<T>;
  }
}

/** One call refreshes the lists, the detail pages and the nav badge. */
function refresh(storeId: string) {
  revalidatePath(`/painel/${storeId}`, "layout");
}

async function access(storeId: string) {
  return requireAccess(storeId, "sorteios");
}

export async function saveRaffleAction(
  raffleId: string | null,
  input: RaffleFormInput,
): Promise<Result<{ id: string }>> {
  return run(async () => {
    const { storeId, ...data } = raffleSchema.parse(input);
    const user = await access(storeId);
    const id = await saveRaffle(storeId, raffleId, data);
    if (raffleId === null) {
      await logActivity(storeId, {
        icon: "gift",
        label: `Criou o sorteio · ${data.name}`,
        detail: "Sorteios",
        by: user.email,
        section: "sorteios",
      });
    }
    refresh(storeId);
    return { id };
  });
}

export async function publishRaffleAction(storeId: string, raffleId: string): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    await publishRaffle(storeId, raffleId);
    await logActivity(storeId, {
      icon: "gift",
      label: "Publicou um sorteio",
      detail: "Sorteios",
      by: user.email,
      section: "sorteios",
    });
    refresh(storeId);
  });
}

export async function setSignupsOpenAction(
  storeId: string,
  raffleId: string,
  open: boolean,
): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    await setSignupsOpen(storeId, raffleId, open);
    await logActivity(storeId, {
      icon: "gift",
      label: open ? "Reabriu as inscrições de um sorteio" : "Encerrou as inscrições de um sorteio",
      detail: "Sorteios",
      by: user.email,
      section: "sorteios",
    });
    refresh(storeId);
  });
}

export async function setRuleCheckAction(
  storeId: string,
  entryId: string,
  ruleId: string,
  on: boolean,
): Promise<Result> {
  return run(async () => {
    await access(storeId);
    await setRuleCheck(storeId, entryId, ruleId, on);
    refresh(storeId);
  });
}

const reasonSchema = z.string().trim().min(3, "Conte o motivo (fica registrado).").max(200);

export async function waiveRuleAction(
  storeId: string,
  entryId: string,
  ruleId: string,
  reason: string,
): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    await waiveRule(storeId, entryId, ruleId, reasonSchema.parse(reason), user.email);
    refresh(storeId);
  });
}

export async function grantExtraAction(
  storeId: string,
  entryId: string,
  count: number,
  reason: string,
): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    const n = z.number().int().min(1).max(5).parse(count);
    await grantExtraNumbers(storeId, entryId, n, reasonSchema.parse(reason), user.email);
    refresh(storeId);
  });
}

export async function pickForEntryAction(
  storeId: string,
  entryId: string,
  picks: number[],
): Promise<Result<{ taken: number }>> {
  try {
    const user = await access(storeId);
    await pickSlotNumbersAdmin(storeId, entryId, picks, user.email);
    refresh(storeId);
    return { ok: true };
  } catch (err) {
    const taken = (err as { number?: number }).number;
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Algo deu errado.",
      ...(typeof taken === "number" ? { taken } : {}),
    };
  }
}

export async function removeNumberAction(
  storeId: string,
  entryId: string,
  n: number,
): Promise<Result> {
  return run(async () => {
    await access(storeId);
    await removeEntryNumber(storeId, entryId, n);
    refresh(storeId);
  });
}

export async function excludeEntryAction(
  storeId: string,
  entryId: string,
  reason: string,
): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    await excludeEntry(storeId, entryId, reasonSchema.parse(reason));
    await logActivity(storeId, {
      icon: "gift",
      label: "Excluiu um participante de um sorteio",
      detail: "Sorteios",
      by: user.email,
      section: "sorteios",
    });
    refresh(storeId);
  });
}

export async function linkLeadAction(
  storeId: string,
  leadId: string,
  customerId: string,
): Promise<Result> {
  return run(async () => {
    await access(storeId);
    await linkLeadToCustomer(storeId, leadId, customerId);
    refresh(storeId);
    revalidatePath(`/painel/${storeId}/clientes`);
  });
}

export async function convertLeadAction(storeId: string, leadId: string): Promise<Result<{ customerId: string }>> {
  return run(async () => {
    const user = await access(storeId);
    const customerId = await convertLeadToCustomer(storeId, leadId);
    await logActivity(storeId, {
      icon: "user-plus",
      label: "Cadastrou cliente a partir de um lead",
      detail: "Sorteios",
      by: user.email,
      section: "sorteios",
    });
    refresh(storeId);
    revalidatePath(`/painel/${storeId}/clientes`);
    return { customerId };
  });
}

const historySchema = z
  .array(z.object({ at: z.string().max(40), text: z.string().max(200) }))
  .max(100);

export async function confirmWinnerAction(
  storeId: string,
  raffleId: string,
  n: number,
  history: { at: string; text: string }[],
): Promise<Result> {
  return run(async () => {
    const user = await access(storeId);
    await confirmWinner(storeId, raffleId, z.number().int().parse(n), historySchema.parse(history), user.email);
    await logActivity(storeId, {
      icon: "gift",
      label: `Confirmou o ganhador do sorteio (nº ${n})`,
      detail: "Sorteios",
      by: user.email,
      section: "sorteios",
    });
    refresh(storeId);
  });
}

export async function announceResultAction(
  storeId: string,
  raffleId: string,
  opts: { showResult: boolean; notifyWinner: boolean; notifyAll: boolean },
): Promise<Result<{ sent: number; failed: number }>> {
  return run(async () => {
    await access(storeId);
    const out = await announceResult(storeId, raffleId, opts);
    refresh(storeId);
    return out;
  });
}
