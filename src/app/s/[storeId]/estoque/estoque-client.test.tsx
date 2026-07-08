// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { EstoqueClient } from "./estoque-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/s/s1/estoque",
}));

vi.mock("@/actions/stock", () => ({
  createStockItemAction: vi.fn(),
  updateStockItemAction: vi.fn(),
  deleteStockItemAction: vi.fn(),
  applyMovementAction: vi.fn(),
  listMovementsAction: vi.fn(),
  markPackageEmptyAction: vi.fn(),
  openNextPackageAction: vi.fn(),
}));

function stockItem(overrides: Partial<StockItem>): StockItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Insumo",
    category: "hortifruti",
    unit: "un",
    tracked: false,
    sealed: 0,
    open: 0,
    qty: 10,
    continuousUse: false,
    consumptionMode: "medido",
    openPkg: false,
    usos: 0,
    resellable: false,
    reorderAt: 2,
    lowStock: false,
    archived: false,
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

const morango = stockItem({ id: "morango", name: "Morango", qty: 10 });
const antigo = stockItem({ id: "antigo", name: "SKU Antigo", archived: true });
const items = [morango, antigo];

function renderList(props: Partial<React.ComponentProps<typeof EstoqueClient>> = {}) {
  return render(
    <AppShellProvider routeKey="/s/s1/estoque">
      <EstoqueClient
        storeId="s1"
        items={items}
        orders={[]}
        menuProducts={[]}
        {...props}
      />
    </AppShellProvider>,
  );
}

describe("EstoqueClient", () => {
  it("hides archived items in the default view (Situação Todas)", () => {
    renderList();
    expect(screen.getAllByText("Morango").length).toBeGreaterThan(0);
    expect(screen.queryByText("SKU Antigo")).not.toBeInTheDocument();
  });

  it("shows only archived items when the Arquivado situação is selected", async () => {
    const user = userEvent.setup();
    renderList();
    // The Situação trigger shows its current option label ("Todas") by default.
    await user.click(screen.getByText("Todas"));
    await user.click(screen.getByRole("menuitem", { name: /Arquivado/ }));
    expect(screen.getAllByText("SKU Antigo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Morango")).not.toBeInTheDocument();
  });
});
