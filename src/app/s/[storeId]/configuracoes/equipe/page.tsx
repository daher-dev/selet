import { getSessionUser, requireAccess } from "@/lib/access";
import { listUsers } from "@/data/users";
import { listStores } from "@/data/stores";
import { EquipeClient } from "./equipe-client";

export default async function EquipePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "equipe");
  const me = await getSessionUser();

  const [members, stores] = await Promise.all([listUsers(), listStores()]);

  return (
    <EquipeClient
      storeId={storeId}
      members={members}
      stores={stores}
      meEmail={me!.email}
      meIsAdmin={me!.role === "admin"}
    />
  );
}
