import { requireAccess } from "@/lib/access";
import { SettingsTabs } from "./settings-tabs";

/** Admin-only shell for Configurações: the tab strip (Loja · Estoque · Financeiro · Equipe) above each tab. */
export default async function ConfiguracoesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "configuracoes");
  return (
    <>
      <SettingsTabs storeId={storeId} />
      {children}
    </>
  );
}
