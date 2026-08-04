import { requireAccess } from "@/lib/access";
import { listVoucherTemplates, listVouchers } from "@/data/vouchers";
import { listCustomers } from "@/data/customers";
import { listProducts } from "@/data/products";
import { VouchersClient } from "./vouchers-client";

export default async function VouchersPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "vouchers");

  const [vouchers, templates, customers, products] = await Promise.all([
    listVouchers(storeId, { limit: 200 }),
    listVoucherTemplates(storeId),
    listCustomers(storeId),
    listProducts(storeId),
  ]);

  return (
    <VouchersClient
      storeId={storeId}
      vouchers={vouchers}
      templates={templates}
      customers={customers.filter((c) => !c.archived)}
      products={products.filter((p) => p.active && !p.archived)}
    />
  );
}
