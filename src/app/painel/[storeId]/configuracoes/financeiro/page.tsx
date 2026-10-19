import { requireAccess } from "@/lib/access";
import { countFinanceTxByCategory, getFinanceSettings } from "@/data/settings";
import { FinanceiroSettingsClient } from "./financeiro-settings-client";

export default async function FinanceiroSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "configuracoes");
  const settings = await getFinanceSettings(storeId);
  const counts = await countFinanceTxByCategory(storeId, settings.categories.map((c) => c.id));
  return <FinanceiroSettingsClient storeId={storeId} settings={settings} counts={counts} />;
}
