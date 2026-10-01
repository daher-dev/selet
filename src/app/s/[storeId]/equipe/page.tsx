import { permanentRedirect } from "next/navigation";

/** Equipe moved under Configurações → Equipe. */
export default async function EquipeMoved({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  permanentRedirect(`/s/${storeId}/configuracoes/equipe`);
}
