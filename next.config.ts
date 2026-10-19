import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin moved from /s/[storeId] to /painel/[storeId] so /s/[slug] can be
  // the public sorteio link. Only known admin segments are redirected, so
  // /s/[slug]/opengraph-image keeps working.
  async redirects() {
    return [
      {
        source:
          "/s/:storeId/:segment(pedidos|clientes|produtos|estoque|financeiro|cartelas|shakes|pudim|equipe|configuracoes|sorteios)/:rest*",
        destination: "/painel/:storeId/:segment/:rest*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
