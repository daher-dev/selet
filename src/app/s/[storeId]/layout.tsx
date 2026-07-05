import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { canAccessStore, requireSessionUser } from "@/lib/access";
import { listStoresForUser } from "@/data/stores";

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

  return (
    <AppShell user={user} store={store} stores={stores}>
      {children}
    </AppShell>
  );
}
