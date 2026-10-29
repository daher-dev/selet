import { getMenuPhoto } from "@/data/menu";

const ID = /^[A-Za-z0-9-]{1,40}$/;

/** Public menu photo. Ids never change content, so it caches forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ storeId: string; photoId: string }> }) {
  const { storeId, photoId } = await params;
  const photo = ID.test(storeId) && ID.test(photoId) ? await getMenuPhoto(storeId, photoId) : null;
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
