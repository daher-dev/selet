import { requireAccess } from "@/lib/access";
import { countStockItemsByCategory, countStockItemsByUnit, getStockSettings } from "@/data/settings";
import { EstoqueSettingsClient } from "./estoque-settings-client";

export default async function EstoqueSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "configuracoes");
  const settings = await getStockSettings(storeId);
  const [categoryCounts, unitCounts] = await Promise.all([
    countStockItemsByCategory(storeId, settings.categories.map((c) => c.id)),
    countStockItemsByUnit(storeId, settings.units.map((u) => u.id)),
  ]);
  return (
    <EstoqueSettingsClient
      storeId={storeId}
      settings={settings}
      categoryCounts={categoryCounts}
      unitCounts={unitCounts}
    />
  );
}
