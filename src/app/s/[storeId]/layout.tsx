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

  // Cheap aggregation counts for the nav badges — gated by section access so
  // members without a section neither see nor pay for the query.
  const [openOrders, lowStock] = await Promise.all([
    canAccessSection(user, "pedidos") ? countOpenOrders(storeId) : Promise.resolve(0),
    canAccessSection(user, "estoque") ? countLowStock(storeId) : Promise.resolve(0),
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
