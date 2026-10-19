import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { countRaffleParticipants, getEntryByToken, getPublicRaffle } from "@/data/raffles";
import { getStore } from "@/data/stores";
import { canSendWhatsApp } from "@/lib/whatsapp";
import { abbreviateName, buildRegulamento, publicEntryView, totalNumbers } from "@/lib/raffles";
import { PublicFlow, type PublicRaffleView } from "./public-flow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pub = await getPublicRaffle(slug);
  if (!pub || pub.state === "indisponivel") return { title: "Sorteio" };
  return {
    title: pub.raffle.name,
    description: `Concorra a ${pub.raffle.prize}. Escolha seu número da sorte.`,
    robots: { index: false },
  };
}

export default async function PublicRafflePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const pub = await getPublicRaffle(slug);

  if (!pub || pub.state === "indisponivel") {
    // Old admin bookmarks (/s/<storeId>) land here since the admin moved to /painel.
    if ((await cookies()).has("__session")) redirect(`/painel/${slug}`);
    notFound();
  }

  const { raffle, storeId } = pub;
  // Only ever the visitor's own entry: cookie set at sign-up/code, or the private ?t= link.
  const jar = await cookies();
  const token = jar.get(`sorteio_${raffle.id}`)?.value || t || "";
  const [entry, store, participants] = await Promise.all([
    token ? getEntryByToken(storeId, raffle.id, token) : null,
    getStore(storeId),
    pub.state === "resultado" ? countRaffleParticipants(storeId, raffle.id) : 0,
  ]);

  const view: PublicRaffleView = {
    name: raffle.name,
    prize: raffle.prize,
    location: raffle.location,
    drawAt: raffle.drawAt,
    signupFrom: raffle.signupFrom,
    numberFrom: raffle.numberFrom,
    numberTo: raffle.numberTo,
    perPerson: raffle.perPerson,
    rules: raffle.rules.map((r) => ({ text: r.text, type: r.type })),
    fields: raffle.fields,
    winner: raffle.winner
      ? { number: raffle.winner.number, name: abbreviateName(raffle.winner.name) }
      : null,
    regulamentoAt: raffle.regulamentoAt,
  };

  return (
    <PublicFlow
      slug={slug}
      raffle={view}
      state={pub.state}
      taken={pub.taken}
      total={totalNumbers(raffle)}
      entry={entry ? publicEntryView(raffle, entry) : null}
      adoptToken={!jar.has(`sorteio_${raffle.id}`) && entry ? t || null : null}
      regulamento={buildRegulamento(raffle, {
        name: store?.name ?? "",
        contact: store?.whatsapp || store?.email || undefined,
      })}
      participants={participants}
      codes={canSendWhatsApp()}
    />
  );
}
