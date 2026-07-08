import { requireSessionUser, canAccessSection } from "@/lib/access";
import { readSummary } from "@/data/summary";
import { DashboardClient } from "./dashboard-client";
import { fastPath, slowPath, monthKey } from "./dashboard-data";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireSessionUser();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisKey = monthKey(startOfMonth);
  const lastKey = monthKey(startOfLastMonth);

  const canPedidos = canAccessSection(user, "pedidos");
  const canClientes = canAccessSection(user, "clientes");
  const canEstoque = canAccessSection(user, "estoque");

  // PREFER the pre-computed summary (one small read). It serves the pedidos and
  // clientes aggregates, so read it whenever either section is visible. When it's
  // present the dashboard does NO growing full-collection scan — every KPI, the
  // channel donut and the top-sellers come from the summary, and only two tiny
  // bounded queries (low-stock strip + upcoming birthdays) hit collections.
  // Absent/older summary → fall back to the old scan-and-compute path below so the
  // dashboard never breaks.
  const summary =
    canPedidos || canClientes ? await readSummary(storeId) : null;

  const view = summary
    ? await fastPath({
        storeId,
        summary,
        now,
        thisKey,
        lastKey,
        canPedidos,
        canClientes,
        canEstoque,
      })
    : await slowPath({
        storeId,
        now,
        startOfMonth,
        startOfLastMonth,
        canPedidos,
        canClientes,
        canEstoque,
      });

  return (
    <DashboardClient
      storeId={storeId}
      kpis={view.kpis}
      byChannel={view.byChannel}
      topSellers={view.topSellers}
      lowStock={view.lowStock}
    />
  );
}
