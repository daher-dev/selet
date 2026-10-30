// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Product, StockItem } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { ProdutosClient } from "./produtos-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/actions/products", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
  deleteProductAction: vi.fn(),
}));

function stock(id: string, name: string): StockItem {
  return { id, name, category: "secos", unit: "un", qty: 12, lowStock: false } as unknown as StockItem;
}

function product(over: Partial<Product> & { id: string; name: string }): Product {
  return {
    price: 0, category: "bebidas", typeTags: [], active: true, createdAt: "", saleType: "menu",
    recipe: [], adicionais: [], tiers: [{ qty: 1, price: 0 }], archived: false, ...over,
  } as Product;
}

// One stock item sold by package AND by dose, each with its own price + commission.
const dual = product({
  id: "p1",
  name: "Fibra Limão",
  saleType: "menu",
  recipe: [{ stockItemId: "s1", name: "Fibra Limão", qty: null, unit: "un" }],
  sale: {
    recipe: [{ stockItemId: "s1", name: "Fibra Limão", qty: null, unit: "un" }],
    adicionais: [],
    tiers: [{ qty: 1, price: 300 }],
    commissionPercent: 5,
  },
  resale: { insumoId: "s1", tiers: [{ qty: 1, price: 3000 }, { qty: 10, price: 25000 }], commissionPercent: 15 },
});

// A real recipe: several ingredients.
const receita = product({
  id: "p2",
  name: "Bolo Proteico",
  category: "lanches",
  recipe: [
    { stockItemId: "s1", name: "Pó", qty: 25, unit: "g" },
    { stockItemId: "s2", name: "Ovo", qty: 1, unit: "un" },
  ],
  sale: {
    recipe: [
      { stockItemId: "s1", name: "Pó", qty: 25, unit: "g" },
      { stockItemId: "s2", name: "Ovo", qty: 1, unit: "un" },
    ],
    adicionais: [],
    tiers: [{ qty: 1, price: 2000 }],
  },
});

function renderList(products: Product[]) {
  return render(
    <AppShellProvider routeKey="produtos">
      <ProdutosClient storeId="s" products={products} stockItems={[stock("s1", "Fibra Limão"), stock("s2", "Ovo")]} />
    </AppShellProvider>,
  );
}

describe("Cardápio card", () => {
  it("a stock item shows no BASE list; each way of selling has its own price and commission", () => {
    renderList([dual]);
    const card = screen.getByText("Fibra Limão", { selector: "h3 span" }).closest('[role="button"]') as HTMLElement;
    expect(within(card).queryByText("Base")).toBeNull();
    // Embalagem: R$ 30,00 + 15% + the 10-pack tier; Dose: R$ 3,00 + 5%.
    expect(within(card).getByText("15% comissão")).toBeTruthy();
    expect(within(card).getByText("5% comissão")).toBeTruthy();
    expect(within(card).getByText(/R\$\s*30,00/)).toBeTruthy();
    expect(within(card).getByText(/R\$\s*3,00/)).toBeTruthy();
    expect(within(card).getByText(/10 embalagens/)).toBeTruthy();
    expect(within(card).getAllByText("Embalagem").length).toBeGreaterThan(0);
    expect(within(card).getAllByText("Dose").length).toBeGreaterThan(0);
  });

  it("a Receita shows its BASE list and one price", () => {
    renderList([receita]);
    const card = screen.getByText("Bolo Proteico", { selector: "h3 span" }).closest('[role="button"]') as HTMLElement;
    expect(within(card).getByText("Base")).toBeTruthy();
    expect(within(card).getByText("Receita")).toBeTruthy();
    expect(within(card).queryByText("Embalagem")).toBeNull();
  });
});
