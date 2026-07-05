import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function FinanceiroPage() {
  return (
    <>
      <PageHeader title="Financeiro" subtitle="Entradas, saídas e saldo." />
      <EmptyState
        icon={Wallet}
        title="Sem lançamentos"
        description="Os pagamentos de pedidos e lançamentos manuais aparecerão aqui."
      />
    </>
  );
}
