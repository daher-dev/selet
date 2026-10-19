import { requireAccess } from "@/lib/access";
import { listStores } from "@/data/stores";
import { notFound } from "next/navigation";
import { LojaClient } from "./loja-client";

export default async function LojaSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "configuracoes");
  const store = (await listStores()).find((s) => s.id === storeId);
  if (!store) notFound();
  return <LojaClient store={store} />;
}
