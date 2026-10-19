import { requireAccess } from "@/lib/access";
import { countLeads, listLeads, listRaffles } from "@/data/raffles";
import { listCustomers } from "@/data/customers";
import { LeadsClient } from "./leads-client";

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ sorteio?: string }>;
}) {
  const { storeId } = await params;
  const { sorteio } = await searchParams;
  await requireAccess(storeId, "sorteios");

  const [leads, counts, raffles, customers] = await Promise.all([
    listLeads(storeId),
    countLeads(storeId),
    listRaffles(storeId),
    listCustomers(storeId),
  ]);

  return (
    <LeadsClient
      storeId={storeId}
      leads={leads}
      customers={customers}
      raffleCount={raffles.length}
      novos={counts.novos}
      raffleFilter={raffles.find((r) => r.id === sorteio)?.id ?? null}
      raffleFilterName={raffles.find((r) => r.id === sorteio)?.name ?? null}
    />
  );
}
