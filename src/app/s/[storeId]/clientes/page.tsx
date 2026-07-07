import { requireAccess } from "@/lib/access";
import { listCustomers } from "@/data/customers";
import { listOrders } from "@/data/orders";
import { ClientesClient } from "./clientes-client";

export default async function ClientesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "clientes");
  // Orders feed the per-customer "Histórico recente" in the detail sheet;
  // filtered by customerId on the client. Already sorted newest-first.
  const [customers, orders] = await Promise.all([
    listCustomers(storeId),
    listOrders(storeId),
  ]);

  return (
    <ClientesClient storeId={storeId} customers={customers} orders={orders} />
  );
}
