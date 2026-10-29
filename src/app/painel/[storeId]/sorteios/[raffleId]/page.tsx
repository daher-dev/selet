import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { getOrigin } from "@/lib/origin";
import { canSendWhatsApp } from "@/lib/whatsapp";
import { getRaffle, listEntries } from "@/data/raffles";
import { getStore } from "@/data/stores";
import { listCustomers } from "@/data/customers";
import { RaffleDetailClient } from "./raffle-detail-client";

export default async function RaffleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string; raffleId: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { storeId, raffleId } = await params;
  const { p } = await searchParams;
  const user = await requireAccess(storeId, "sorteios");

  const raffle = await getRaffle(storeId, raffleId);
  if (!raffle) notFound();

  const [entries, customers, origin, store] = await Promise.all([
    listEntries(storeId, raffleId),
    listCustomers(storeId),
    getOrigin(),
    getStore(storeId),
  ]);

  return (
    <RaffleDetailClient
      storeId={storeId}
      raffle={raffle}
      entries={entries}
      customers={customers}
      origin={origin}
      storeInstagram={store?.instagram}
      userName={user.name || user.email}
      initialSelectedId={p ?? null}
      canSend={canSendWhatsApp()}
    />
  );
}
