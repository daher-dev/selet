import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { MenuPrintStyles, MenuView } from "@/components/menu/menu-view";
import { getPublishedMenu, loadMenuCatalog } from "@/data/menu";
import { getStore } from "@/data/stores";
import { resolveMenu } from "@/lib/menu";
import { getOrigin } from "@/lib/origin";

const STORE_ID = /^[a-z0-9-]{1,40}$/;

type Params = { params: Promise<{ storeId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { storeId } = await params;
  const store = STORE_ID.test(storeId) ? await getStore(storeId) : null;
  return {
    title: store ? `Cardápio · ${store.name}` : "Cardápio",
    description: "Shakes, refeições e lanches proteicos. Preços sempre atualizados.",
  };
}

/** The customer menu behind the link and the QR code. Prints as the A4 menu. */
export default async function PublicMenuPage({ params }: Params) {
  const { storeId } = await params;
  if (!STORE_ID.test(storeId)) notFound();
  const [menu, store] = await Promise.all([getPublishedMenu(storeId), getStore(storeId)]);
  if (!menu || !store) notFound();
  const catalog = await loadMenuCatalog(storeId);
  const sections = resolveMenu(menu.doc, catalog);
  const url = `${await getOrigin()}/cardapio/${storeId}`;
  // Brazilian numbers are stored without the country code ("27 98811-9617").
  const digits = store.whatsapp?.replace(/\D/g, "") ?? "";
  const wa = digits && (digits.startsWith("55") && digits.length > 11 ? digits : `55${digits}`);
  const props = { storeId, doc: menu.doc, sections, store, url, updatedAt: menu.publishedAt };

  return (
    <main className="min-h-dvh bg-surface print:bg-white">
      <MenuPrintStyles />
      <div className="mx-auto max-w-[880px] shadow-[0_0_0_1px_#E7EEE6] print:hidden">
        <MenuView {...props} mode="screen" />
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="sticky bottom-4 mx-auto mb-4 flex h-[52px] w-[calc(100%-32px)] max-w-[420px] items-center justify-center gap-2 rounded-[14px] bg-channel-whatsapp text-[15px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(15,82,51,.55)]"
          >
            <MessageCircle className="size-[18px]" strokeWidth={2} />
            Pedir pelo WhatsApp
          </a>
        )}
      </div>
      <div className="hidden print:block">
        <MenuView {...props} mode="print" />
      </div>
    </main>
  );
}
