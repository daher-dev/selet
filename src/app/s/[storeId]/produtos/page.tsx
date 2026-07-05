import { UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProdutosPage() {
  return (
    <>
      <PageHeader title="Catálogo" subtitle="O cardápio da sua loja." />
      <EmptyState
        icon={UtensilsCrossed}
        title="Nenhum produto ainda"
        description="Adicione produtos ao cardápio para começar a vender."
      />
    </>
  );
}
