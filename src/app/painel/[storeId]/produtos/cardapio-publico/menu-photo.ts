"use client";

import { uploadMenuPhotoAction } from "@/actions/menu";

const MAX_SIDE = 1600;
const MAX_BYTES = 880_000;

/** Shrinks a phone photo in the browser (≤1600px, WebP or JPEG under ~900 KB) and uploads it. Returns the photo id. */
export async function uploadMenuPhoto(storeId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    // Browsers without WebP encoding hand back a PNG: use JPEG instead.
    if (blob && blob.type !== "image/webp") blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) break;
  }
  if (!blob || blob.size > MAX_BYTES) throw new Error("Não deu para reduzir essa foto. Tente outra.");

  const form = new FormData();
  form.append("photo", new File([blob], "foto", { type: blob.type }));
  const r = await uploadMenuPhotoAction(storeId, form);
  if (!r.ok || !r.id) throw new Error(r.error ?? "Não foi possível enviar a foto.");
  return r.id;
}
