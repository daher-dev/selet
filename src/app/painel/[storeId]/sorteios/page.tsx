import { requireAccess } from "@/lib/access";
import { getOrigin } from "@/lib/origin";
import { countLeads, listRaffles } from "@/data/raffles";
import { SorteiosClient } from "./sorteios-client";

export default async function SorteiosPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  await requireAccess(storeId, "sorteios");

  const [raffles, leads, origin] = await Promise.all([
    listRaffles(storeId),
    countLeads(storeId),
    getOrigin(),
  ]);

  return <SorteiosClient storeId={storeId} raffles={raffles} leadCounts={leads} origin={origin} />;
}
