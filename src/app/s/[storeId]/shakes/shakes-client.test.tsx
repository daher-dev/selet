// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Product, ShakeBrinde } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { ShakesClient } from "./shakes-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/s/s1/shakes",
}));

vi.mock("@/actions/shakes", () => ({
  createShakeFlavorAction: vi.fn(),
  updateShakeFlavorAction: vi.fn(),
  createShakeBaseAction: vi.fn(),
  updateShakeBaseAction: vi.fn(),
  createShakeRimAction: vi.fn(),
  updateShakeRimAction: vi.fn(),
  createShakeMixinAction: vi.fn(),
  updateShakeMixinAction: vi.fn(),
  createShakeUtensilAction: vi.fn(),
  updateShakeUtensilAction: vi.fn(),
  addShakeBrindesAction: vi.fn(),
  setShakeBrindeArchivedAction: vi.fn(),
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

function brinde(overrides: Partial<ShakeBrinde>): ShakeBrinde {
  return {
    id: Math.random().toString(36).slice(2),
    productId: overrides.id ?? "chá-limao",
    name: "Chá Limão",
    archived: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

const chaLimao = product({ id: "cha-limao", name: "Chá Limão", price: 1200, category: "bebidas" });
const chaPessego = product({ id: "cha-pessego", name: "Chá Pêssego", price: 1400, category: "bebidas" });
const products = [chaLimao, chaPessego];

const brindeAtivo = brinde({
  id: "cha-limao",
  productId: "cha-limao",
  name: "Chá Limão",
  archived: false,
});
const brindeArquivado = brinde({
  id: "cha-hibisco",
  productId: "cha-hibisco",
  name: "Chá Hibisco",
  archived: true,
});

function renderShakes(props: Partial<React.ComponentProps<typeof ShakesClient>> = {}) {
  return render(
    <AppShellProvider routeKey="/s/s1/shakes">
      <ShakesClient
        storeId="s1"
        flavors={[]}
        bases={[]}
        rims={[]}
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

describe("ShakesClient — Brindes tab", () => {
  it("renders the Brindes tab 5th, between Adicionais and Utensílios, with a count badge", () => {
    renderShakes();
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t): t is string => !!t && /·/.test(t));
    const order = labels.map((t) => t.split(" ·")[0]);
    expect(order).toEqual(["Sabores", "Bases", "Bordas", "Adicionais", "Brindes", "Utensílios"]);
    expect(screen.getByText("Brindes · 2")).toBeInTheDocument();
  });

  it("shows the struck menu price and R$ 0,00 on a brinde card", async () => {
    const user = userEvent.setup();
    renderShakes();
    await user.click(screen.getByText("Brindes · 2"));
    expect(screen.getByText("R$ 12,00")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0,00").length).toBeGreaterThan(0);
  });

  it("shows an Arquivado pill for an archived brinde", async () => {
    const user = userEvent.setup();
    renderShakes();
    await user.click(screen.getByText("Brindes · 2"));
    expect(screen.getAllByText("Arquivado").length).toBeGreaterThan(0);
  });

  it("opens the picker from the dashed add-card, and its footer pluralizes and disables at zero", async () => {
    const user = userEvent.setup();
    renderShakes();
    await user.click(screen.getByText("Brindes · 2"));
    await user.click(screen.getByText("+ Adicionar brinde"));

    expect(await screen.findByText("Adicionar do cardápio")).toBeInTheDocument();
    // The already-active brinde (Chá Limão) must NOT appear in the add-only picker.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Chá Limão")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Chá Pêssego")).toBeInTheDocument();

    const addButton = within(dialog).getByRole("button", { name: /Adicionar 0 brindes/ });
    expect(addButton).toBeDisabled();

    await user.click(within(dialog).getByText("Chá Pêssego"));
    expect(
      within(dialog).getByRole("button", { name: /Adicionar 1 brinde$/ }),
    ).not.toBeDisabled();
  });
});
