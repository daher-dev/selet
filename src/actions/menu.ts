"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/access";
import { logActivity } from "@/data/activity";
import { publishMenu, saveMenuDraft, saveMenuPhoto, unpublishMenu } from "@/data/menu";
import { MENU_SOURCES, MENU_TAGS } from "@/lib/menu";
import type { ActionResult } from "./products";

const text = (max: number) => z.string().trim().max(max, "Texto muito longo.");

const photoId = z.string().regex(/^[A-Za-z0-9]{20}$/);
const picks = z.array(z.object({ id: z.string().min(1).max(80), qty: z.number().int().min(1).max(10) })).max(20);

const menuSchema = z.object({
  title: text(60),
  tagline: text(200),
  coverPhoto: photoId.optional(),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        title: text(60),
        kicker: text(40).optional(),
        note: text(160).optional(),
        newPage: z.boolean().optional(),
        entries: z
          .array(
            z.object({
              source: z.enum(MENU_SOURCES),
              id: z.string().min(1).max(80),
              name: text(60).optional(),
              description: text(280).optional(),
              tag: z.enum(MENU_TAGS).optional(),
              photo: photoId.optional(),
              caption: text(30).optional(),
              mix: z
                .object({
                  flavorIds: z.array(z.string().min(1).max(80)).min(1, "Escolha pelo menos um sabor.").max(3),
                  baseId: z.string().min(1).max(80).nullable(),
                  rims: picks,
                  mixins: picks,
                })
                .optional(),
            }),
          )
          .max(200),
      }),
    )
    .max(40),
});

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    return { ok: false, error: err instanceof Error ? err.message : "Algo deu errado." };
  }
}

/** Autosave of the editor; never touches what customers see. */
export async function saveMenuDraftAction(storeId: string, draft: z.input<typeof menuSchema>): Promise<ActionResult> {
  return run(async () => {
    await requireAccess(storeId, "produtos");
    await saveMenuDraft(storeId, menuSchema.parse(draft));
  });
}

export async function publishMenuAction(
  storeId: string,
  draft: z.input<typeof menuSchema>,
): Promise<ActionResult & { publishedAt?: string }> {
  let publishedAt = "";
  const r = await run(async () => {
    const user = await requireAccess(storeId, "produtos");
    publishedAt = await publishMenu(storeId, menuSchema.parse(draft));
    await logActivity(storeId, { icon: "book-open", label: "Publicou o cardápio público", detail: "Cardápio", by: user.email, section: "produtos" });
    revalidatePath(`/cardapio/${storeId}`);
  });
  return r.ok ? { ...r, publishedAt } : r;
}

export async function unpublishMenuAction(storeId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await requireAccess(storeId, "produtos");
    await unpublishMenu(storeId);
    await logActivity(storeId, { icon: "eye-off", label: "Tirou o cardápio público do ar", detail: "Cardápio", by: user.email, section: "produtos" });
    revalidatePath(`/cardapio/${storeId}`);
  });
}

// Browser-resized photo (see menu-photo.ts); anything bigger or not an image is refused.
const MAX_PHOTO_BYTES = 900_000;
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

export async function uploadMenuPhotoAction(storeId: string, form: FormData): Promise<ActionResult & { id?: string }> {
  let id = "";
  const r = await run(async () => {
    await requireAccess(storeId, "produtos");
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Escolha uma foto.");
    if (file.size > MAX_PHOTO_BYTES) throw new Error("Foto muito grande.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = isWebp(bytes) ? "image/webp" : isJpeg(bytes) ? "image/jpeg" : null;
    if (!type) throw new Error("Use uma foto JPG, PNG ou WebP.");
    id = await saveMenuPhoto(storeId, bytes, type);
  });
  return r.ok ? { ...r, id } : r;
}
