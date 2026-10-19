import { getSessionUser, requireAccess } from "@/lib/access";
import { getFinanceSettings } from "@/data/settings";
import { FinanceSettingsProvider } from "@/components/finance-settings-context";

/** Loads the store's lançamento categories once for Financeiro and Movimentações. */
export default async function FinanceiroLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "financeiro");
  const [settings, me] = await Promise.all([getFinanceSettings(storeId), getSessionUser()]);
  return (
    <FinanceSettingsProvider settings={settings} isAdmin={me?.role === "admin"}>
      {children}
    </FinanceSettingsProvider>
  );
}
