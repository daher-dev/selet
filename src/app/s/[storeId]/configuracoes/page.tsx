import { redirect } from "next/navigation";

export default async function ConfiguracoesIndex({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/s/${storeId}/configuracoes/loja`);
}
