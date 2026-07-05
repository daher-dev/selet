import { Package } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function EstoquePage() {
  return (
    <>
      <PageHeader title="Estoque" subtitle="Insumos e inventário." />
      <EmptyState
        icon={Package}
        title="Nenhum item ainda"
        description="Cadastre insumos para controlar entradas, saídas e alertas de reposição."
      />
    </>
  );
}
