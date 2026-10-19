import { requireAccess } from "@/lib/access";
import { listCartelas } from "@/data/cartelas";
import { CartelasClient } from "./cartelas-client";

export default async function CartelasPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "cartelas");

  const cartelas = await listCartelas(storeId, { limit: 200 });

  return <CartelasClient storeId={storeId} cartelas={cartelas} />;
}
