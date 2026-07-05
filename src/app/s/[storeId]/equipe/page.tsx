import { UserCog } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function EquipePage() {
  return (
    <>
      <PageHeader title="Equipe" subtitle="Membros, acessos e permissões." />
      <EmptyState
        icon={UserCog}
        title="Só você por aqui"
        description="Convide membros da equipe e defina o que cada um pode acessar."
      />
    </>
  );
}
