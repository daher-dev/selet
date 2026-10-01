import { requireSessionUser, canAccessSection } from "@/lib/access";
import { readSummary } from "@/data/summary";
import { DashboardClient } from "./dashboard-client";
import { loadDashboard } from "./dashboard-data";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireSessionUser();

  const canPedidos = canAccessSection(user, "pedidos");
  const canClientes = canAccessSection(user, "clientes");
  const canEstoque = canAccessSection(user, "estoque");

  // One small read for the 12-month evolution + low-stock count. A missing
  // summary makes loadDashboard fall back to a bounded orders scan.
  const summary =
    canPedidos || canEstoque ? await readSummary(storeId) : null;

  const view = await loadDashboard({
    storeId,
    summary,
    now: new Date(),
    canPedidos,
    canClientes,
    canEstoque,
  });

  return <DashboardClient storeId={storeId} view={view} />;
}
