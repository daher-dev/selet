import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle="Acompanhe o dia a dia da sua loja."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Em construção"
        description="Os indicadores da loja aparecerão aqui."
      />
    </>
  );
}
