import { requireAccess } from "@/lib/access";
import { listCustomers } from "@/data/customers";
import { ClientesClient } from "./clientes-client";

export default async function ClientesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "clientes");
  const customers = await listCustomers(storeId);

  return <ClientesClient storeId={storeId} customers={customers} />;
}
