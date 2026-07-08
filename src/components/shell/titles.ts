import type { Store } from "@/lib/types";

/**
 * Route → page title map, mirroring the design's `titles` object
 * (Selet Admin.dc.html:2779). Keyed by the path segment under
 * /s/[storeId] ("" = dashboard). The subtitle may be store-aware.
 */
const TITLES: Record<
  string,
  { title: string; subtitle: string | ((store: Store) => string) }
> = {
  "": { title: "Visão geral", subtitle: (s) => `Resumo de hoje · ${s.name}` },
  pedidos: {
    title: "Pedidos",
    subtitle: "Acompanhe vendas do Instagram, WhatsApp e loja",
  },
  clientes: { title: "Clientes", subtitle: "Retenção, histórico e engajamento" },
  produtos: { title: "Catálogo", subtitle: "Itens à venda · revenda e menu" },
  estoque: { title: "Estoque", subtitle: "Embalagens, fracionamento e rendimento" },
  financeiro: { title: "Financeiro", subtitle: "Saldo, entradas e saídas" },
  equipe: { title: "Equipe", subtitle: "Gestão de funcionários por loja" },
};

/** Resolve the current segment from a store-scoped pathname. */
export function segmentFromPathname(pathname: string, storeId: string): string {
  const base = `/s/${storeId}`;
  if (pathname === base || pathname === `${base}/`) return "";
  const rest = pathname.slice(base.length + 1);
  return rest.split("/")[0] ?? "";
}

export function pageMeta(
  segment: string,
  store: Store,
): { title: string; subtitle: string } {
  const meta = TITLES[segment] ?? TITLES[""];
  return {
    title: meta.title,
    subtitle:
      typeof meta.subtitle === "function" ? meta.subtitle(store) : meta.subtitle,
  };
}
