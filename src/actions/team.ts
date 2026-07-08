"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import {
  getUserByEmail,
  inviteUser,
  setUserStatus,
  updateUserAccess,
} from "@/data/users";
import { GRANTABLE_SECTIONS } from "@/lib/types";
import type { ActionResult } from "./products";

const memberSchema = z.object({
  storeId: z.string().min(1), // current store, for the permission gate
  email: z.email("E-mail inválido."),
  name: z.string().trim().min(1, "Informe o nome."),
  phone: z.string().trim().optional(),
  role: z.enum(["admin", "funcionario"]),
  storeIds: z.union([z.literal("all"), z.array(z.string())]),
  // Only the five grantable modules are accepted — "equipe" is admin-only and
  // can never be granted to a funcionário (server-side escalation guard).
  sections: z.array(z.enum(GRANTABLE_SECTIONS)),
});

export type MemberFormInput = z.input<typeof memberSchema>;

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Algo deu errado.",
    };
  }
}

/** Managing admins (or promoting to admin) requires being an admin. */
function assertCanManage(
  actor: { role: string; email: string },
  targetRole: string,
  targetEmail?: string,
) {
  if (actor.role !== "admin" && targetRole === "admin") {
    throw new Error("Apenas administradores podem gerenciar administradores.");
  }
  if (targetEmail && targetEmail.toLowerCase() === actor.email) {
    throw new Error("Você não pode alterar o próprio acesso.");
  }
}

export async function inviteMemberAction(
  input: MemberFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, ...data } = memberSchema.parse(input);
    const actor = await requireAccess(storeId, "equipe");
    assertCanManage(actor, data.role);
    await inviteUser(data);
    revalidatePath(`/s/${storeId}/equipe`);
  });
}

export async function updateMemberAction(
  input: MemberFormInput,
): Promise<ActionResult> {
  return run(async () => {
    const { storeId, email, ...data } = memberSchema.parse(input);
    const actor = await requireAccess(storeId, "equipe");
    const target = await getUserByEmail(email);
    if (!target) throw new Error("Membro não encontrado.");
    assertCanManage(actor, target.role, email);
    assertCanManage(actor, data.role);
    await updateUserAccess(email, data);
    revalidatePath(`/s/${storeId}/equipe`);
  });
}

export async function setMemberStatusAction(
  storeId: string,
  email: string,
  status: "ativo" | "inativo",
): Promise<ActionResult> {
  return run(async () => {
    const actor = await requireAccess(storeId, "equipe");
    const target = await getUserByEmail(email);
    if (!target) throw new Error("Membro não encontrado.");
    assertCanManage(actor, target.role, email);
    await setUserStatus(email, status);
    revalidatePath(`/s/${storeId}/equipe`);
  });
}
