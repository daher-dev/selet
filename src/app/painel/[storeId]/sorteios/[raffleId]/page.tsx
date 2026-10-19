import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { getOrigin } from "@/lib/origin";
import { getRaffle, listEntries } from "@/data/raffles";
import { listCustomers } from "@/data/customers";
import { RaffleDetailClient } from "./raffle-detail-client";

export default async function RaffleDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; raffleId: string }>;
}) {
  const { storeId, raffleId } = await params;
  const user = await requireAccess(storeId, "sorteios");

  const raffle = await getRaffle(storeId, raffleId);
  if (!raffle) notFound();

  const [entries, customers, origin] = await Promise.all([
    listEntries(storeId, raffleId),
    listCustomers(storeId),
    getOrigin(),
  ]);

  return (
    <RaffleDetailClient
      storeId={storeId}
      raffle={raffle}
      entries={entries}
      customers={customers}
      origin={origin}
      userName={user.name || user.email}
    />
  );
}
