// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem, StockMovement } from "@/lib/types";
import { StockDetailSheet } from "./estoque-detail-sheet";

const stockActions = vi.hoisted(() => ({
  applyMovementAction: vi.fn(),
  listMovementsAction: vi.fn(),
  markPackageEmptyAction: vi.fn(),
  openNextPackageAction: vi.fn(),
  updateMovementAction: vi.fn(),
  updateStockItemAction: vi.fn(),
  deleteStockItemAction: vi.fn(),
}));

vi.mock("@/actions/stock", () => stockActions);

function stockItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: "item-1",
    name: "Granola",
    category: "secos",
    unit: "g",
    tracked: true,
    pkgLabel: "pote",
    pkgSize: 500,
    sealed: 5,
    open: 0,
    qty: 2500,
    continuousUse: false,
    consumptionMode: "medido",
    openPkg: false,
    usos: 0,
    resellable: false,
    cost: 1800,
    reorderAt: 2,
    lowStock: false,
    archived: false,
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "mov-1",
    type: "entrada",
    qty: 5,
    byPackage: true,
    price: 1800,
    reason: "ENTRADA",
    by: "user@selet.com",
    at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("StockDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stockActions.updateMovementAction.mockResolvedValue({ ok: true });
  });

  it("allows editing a manual stock movement from the timeline", async () => {
    stockActions.listMovementsAction.mockResolvedValue([movement()]);
    const user = userEvent.setup();

    render(
      <StockDetailSheet
        storeId="s1"
        item={stockItem()}
        orders={[]}
        menuProducts={[]}
        resaleNames={[]}
        usedIn={[]}
        open
        onOpenChange={() => {}}
      />,
    );

    await user.click(await screen.findByLabelText(/Editar movimentação/));
    const qtyInput = screen.getByDisplayValue("5");
    await user.clear(qtyInput);
    await user.type(qtyInput, "3");
    await user.click(screen.getByRole("button", { name: /Salvar edição/i }));

    await waitFor(() =>
      expect(stockActions.updateMovementAction).toHaveBeenCalledWith({
        storeId: "s1",
        itemId: "item-1",
        movementId: "mov-1",
        qty: 3,
        byPackage: true,
        price: 1800,
      }),
    );
  });

  it("keeps linked movements read-only in the timeline", async () => {
    stockActions.listMovementsAction.mockResolvedValue([
      movement({
        id: "mov-sale",
        type: "saida",
        qty: 1,
        price: undefined,
        reason: "VENDA",
        refOrder: "P123",
      }),
    ]);

    render(
      <StockDetailSheet
        storeId="s1"
        item={stockItem()}
        orders={[]}
        menuProducts={[]}
        resaleNames={[]}
        usedIn={[]}
        open
        onOpenChange={() => {}}
      />,
    );

    await screen.findByText("Pedido #P123");
    expect(screen.queryByLabelText(/Editar movimentação/)).not.toBeInTheDocument();
  });
});
