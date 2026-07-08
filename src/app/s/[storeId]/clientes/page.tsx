import { requireAccess } from "@/lib/access";
import { listCustomers } from "@/data/customers";
import { listOrders } from "@/data/orders";
import { listStores } from "@/data/stores";
import { ClientesClient } from "./clientes-client";

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const { storeId } = await params;
  const { seg } = await searchParams;
  await requireAccess(storeId, "clientes");
  // Orders feed the per-customer "Histórico recente" and the "A receber" /
  // reorder signals in the detail sheet; filtered by customerId on the client.
  // Stores give us the current store's display name so new customers derive
  // their city from the active store (design 2401).
  const [customers, orders, stores] = await Promise.all([
    listCustomers(storeId),
    listOrders(storeId),
    listStores(),
  ]);
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  return (
    <ClientesClient
      storeId={storeId}
      storeName={storeName}
      customers={customers}
      orders={orders}
      initialSegment={seg}
    />
  );
}
