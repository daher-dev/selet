import { requireAccess } from "@/lib/access";
import { countProductsByCategory, getProductSettings } from "@/data/settings";
import { CardapioSettingsClient } from "./cardapio-settings-client";

export default async function CardapioSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "configuracoes");
  const settings = await getProductSettings(storeId);
  const categoryCounts = await countProductsByCategory(storeId, settings.categories.map((c) => c.id));
  return <CardapioSettingsClient storeId={storeId} settings={settings} categoryCounts={categoryCounts} />;
}
