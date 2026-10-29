import { requireAccess } from "@/lib/access";
import { getMenuState, loadMenuCatalog } from "@/data/menu";
import { getStore } from "@/data/stores";
import { getOrigin } from "@/lib/origin";
import { MenuBuilder } from "./menu-builder";

export default async function CardapioPublicoPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "produtos");
  const [catalog, store, origin] = await Promise.all([loadMenuCatalog(storeId), getStore(storeId), getOrigin()]);
  const state = await getMenuState(storeId, catalog);
  return (
    <MenuBuilder
      storeId={storeId}
      catalog={catalog}
      initial={state}
      store={{ name: store?.name ?? "", whatsapp: store?.whatsapp, address: store?.address }}
      url={`${origin}/cardapio/${storeId}`}
    />
  );
}
