import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function PedidosPage() {
  return (
    <>
      <PageHeader title="Pedidos" subtitle="Gerencie as vendas da loja." />
      <EmptyState
        icon={ShoppingBag}
        title="Nenhum pedido ainda"
        description="Os pedidos por Instagram, WhatsApp e loja física aparecerão aqui."
      />
    </>
  );
}
