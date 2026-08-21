// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Product, PudimBrinde, PudimFlavor } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { PudimClient } from "./pudim-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/s/s1/pudim",
}));

vi.mock("@/actions/pudim", () => ({
  createPudimFlavorAction: vi.fn(),
  updatePudimFlavorAction: vi.fn(),
  createPudimBaseAction: vi.fn(),
  updatePudimBaseAction: vi.fn(),
  createPudimMixinAction: vi.fn(),
  updatePudimMixinAction: vi.fn(),
  createPudimUtensilAction: vi.fn(),
  updatePudimUtensilAction: vi.fn(),
  addPudimBrindesAction: vi.fn(),
  setPudimBrindeArchivedAction: vi.fn(),
}));

function product(overrides: Partial<Product>): Product {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Produto",
    price: 1200,
    category: "bebidas",
    typeTags: [],
    active: true,
    createdAt: "2026-01-01T12:00:00.000Z",
    saleType: "menu",
    recipe: [],
    adicionais: [],
    tiers: [{ qty: 1, price: 1200 }],
    stockManaged: false,
    producedStock: 0,
    archived: false,
    ...overrides,
  };
}

function flavor(overrides: Partial<PudimFlavor> & { id: string }): PudimFlavor {
  return {
    name: overrides.id,
    price: 3200,
    recipe: [{ stockItemId: "ins-1", name: "Shake Banana", qty: 26, unit: "g" }],
    archived: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

function brinde(overrides: Partial<PudimBrinde> & { id: string }): PudimBrinde {
  return {
    productId: overrides.id,
    name: "Chá Limão",
    archived: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

const chaLimao = product({ id: "cha-limao", name: "Chá Limão", price: 1200, category: "bebidas" });
const chaPessego = product({ id: "cha-pessego", name: "Chá Pêssego", price: 1400, category: "bebidas" });
const products = [chaLimao, chaPessego];

const brindeAtivo = brinde({ id: "cha-limao", name: "Chá Limão", archived: false });
const brindeArquivado = brinde({ id: "cha-hibisco", name: "Chá Hibisco", archived: true });

function renderPudim(props: Partial<React.ComponentProps<typeof PudimClient>> = {}) {
  return render(
    <AppShellProvider routeKey="/s/s1/pudim">
      <PudimClient
        storeId="s1"
        flavors={[]}
        bases={[]}
        mixins={[]}
        utensils={[]}
        brindes={[brindeAtivo, brindeArquivado]}
        products={products}
        stockItems={[]}
        {...props}
      />
    </AppShellProvider>,
  );
}

describe("PudimClient — tabs", () => {
  it("renders exactly 5 tabs, in order, with no 'Bordas' tab (unlike Shakes)", () => {
    renderPudim();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t): t is string => !!t && /·/.test(t));
    const order = labels.map((t) => t.split(" ·")[0]);
    expect(order).toEqual(["Sabores", "Bases", "Adicionais", "Brindes", "Utensílios"]);
    expect(order).not.toContain("Bordas");
  });

  it("shows a live count per tab", () => {
    renderPudim({ flavors: [flavor({ id: "f1" }), flavor({ id: "f2" })] });
    expect(screen.getByText("Sabores · 2")).toBeInTheDocument();
    expect(screen.getByText("Brindes · 2")).toBeInTheDocument();
  });

  it("switches tabs on click, showing that tab's empty state", async () => {
    const user = userEvent.setup();
    renderPudim();
    expect(screen.getByText("Nenhum sabor ainda")).toBeInTheDocument();
    await user.click(screen.getByText("Bases · 0"));
    expect(screen.getByText("Nenhuma base ainda")).toBeInTheDocument();
    await user.click(screen.getByText("Adicionais · 0"));
    expect(screen.getByText("Nenhum adicional ainda")).toBeInTheDocument();
    await user.click(screen.getByText("Utensílios · 0"));
    expect(screen.getByText("Nenhum utensílio ainda")).toBeInTheDocument();
  });
});

describe("PudimClient — Sabores tab", () => {
  it("renders a flavor card with its insumo count and price per copo", () => {
    renderPudim({
      flavors: [
        flavor({
          id: "frutas-amarelas",
          name: "Frutas Amarelas",
          price: 3200,
          recipe: [{ stockItemId: "ins-1", name: "Shake Banana", qty: 26, unit: "g" }],
        }),
      ],
    });
    expect(screen.getByText("Frutas Amarelas")).toBeInTheDocument();
    expect(screen.getByText("1 insumo")).toBeInTheDocument();
    expect(screen.getByText("R$ 32,00")).toBeInTheDocument();
  });

  it("shows an Arquivado pill for an archived flavor", () => {
    renderPudim({ flavors: [flavor({ id: "abacaxi", name: "Abacaxi", archived: true })] });
    expect(screen.getByText("Arquivado")).toBeInTheDocument();
  });

  it("opens the create-flavor sheet from the empty state's action button", async () => {
    const user = userEvent.setup();
    renderPudim();
    await user.click(screen.getByRole("button", { name: "Novo sabor" }));
    expect(await screen.findByText("Sabor de pudim")).toBeInTheDocument();
  });

  it("opens the edit-flavor sheet pre-filled when a card is clicked", async () => {
    const user = userEvent.setup();
    renderPudim({ flavors: [flavor({ id: "cookies", name: "Cookies", price: 3400 })] });
    await user.click(screen.getByText("Cookies"));
    expect(await screen.findByText("Sabor de pudim")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByDisplayValue("Cookies")).toBeInTheDocument();
    // Archive/restore affordance only appears for an existing (not new) flavor.
    expect(within(dialog).getByRole("button", { name: "Arquivar" })).toBeInTheDocument();
  });
});

describe("PudimClient — Brindes tab", () => {
  it("shows the struck menu price and R$ 0,00 on a brinde card", async () => {
    const user = userEvent.setup();
    renderPudim();
    await user.click(screen.getByText("Brindes · 2"));
    expect(screen.getByText("R$ 12,00")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Com o pudim").length).toBeGreaterThan(0);
  });

  it("opens the picker from the dashed add-card, excluding the already-active brinde", async () => {
    const user = userEvent.setup();
    renderPudim();
    await user.click(screen.getByText("Brindes · 2"));
    await user.click(screen.getByText("+ Adicionar brinde"));

    expect(await screen.findByText("Adicionar do cardápio")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Chá Limão")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Chá Pêssego")).toBeInTheDocument();
  });
});
