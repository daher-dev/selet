import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import {
  canAccessSection,
  canAccessStore,
  requireSessionUser,
} from "@/lib/access";
import { listStoresForUser } from "@/data/stores";
import { countOpenOrders } from "@/data/orders";
import { countLowStock } from "@/data/stock";
import { readSummary } from "@/data/summary";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireSessionUser();

  if (!canAccessStore(user, storeId)) notFound();

  const stores = await listStoresForUser(user);
  const store = stores.find((s) => s.id === storeId);
  if (!store) {
    // Store doesn't exist (or user lost access) — send to their first store.
    redirect(stores[0] ? `/s/${stores[0].id}` : "/login");
  }

  // Nav badge counts — PREFER the pre-computed summary doc (one small read),
  // falling back to the aggregation queries when it's absent so the badges never
  // break. Gated by section access so members without a section pay for nothing.
  const summary = await readSummary(storeId);
  const [openOrders, lowStock] = await Promise.all([
    !canAccessSection(user, "pedidos")
      ? Promise.resolve(0)
      : summary
        ? Promise.resolve(summary.openOrders)
        : countOpenOrders(storeId),
    !canAccessSection(user, "estoque")
      ? Promise.resolve(0)
      : summary
        ? Promise.resolve(summary.lowStock)
        : countLowStock(storeId),
  ]);

  return (
    <AppShell
      user={user}
      store={store}
      stores={stores}
      badges={{ openOrders, lowStock }}
    >
      {children}
    </AppShell>
  );
}
