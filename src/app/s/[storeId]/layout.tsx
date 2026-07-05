import { AppShell } from "@/components/shell/app-shell";
import type { SessionUser, Store } from "@/lib/types";

// TODO(M2): replace placeholders with real session (getSessionUser) and
// store membership checks; redirect to /login when unauthenticated.
const PLACEHOLDER_USER: SessionUser = {
  email: "joao@daher.dev",
  uid: null,
  name: "João Daher",
  role: "admin",
  storeIds: "all",
  sections: [],
  status: "ativo",
};

const PLACEHOLDER_STORES: Store[] = [
  { id: "demo", name: "Vila Velha/ES", sub: "Loja matriz", initial: "V" },
];

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store =
    PLACEHOLDER_STORES.find((s) => s.id === storeId) ?? PLACEHOLDER_STORES[0];

  return (
    <AppShell user={PLACEHOLDER_USER} store={store} stores={PLACEHOLDER_STORES}>
      {children}
    </AppShell>
  );
}
