import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function ClientesPage() {
  return (
    <>
      <PageHeader title="Clientes" subtitle="Sua base de clientes." />
      <EmptyState
        icon={Users}
        title="Nenhum cliente ainda"
        description="Cadastre clientes para acompanhar pedidos, aniversários e recompras."
      />
    </>
  );
}
