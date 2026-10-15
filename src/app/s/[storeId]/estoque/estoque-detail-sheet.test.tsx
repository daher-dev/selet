// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem, StockMovement } from "@/lib/types";
import { StockDetailSheet } from "./estoque-detail-sheet";

const stockActions = vi.hoisted(() => ({
  applyMovementAction: vi.fn(),
  deleteMovementAction: vi.fn(),
  getStockItemAction: vi.fn(),
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
    depSealed: 3,
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
    loc: "loja",
    by: "user@selet.com",
    at: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

const page = (...rows: StockMovement[]) => ({ rows, next: null });

const handlers = {
  onBuy: vi.fn(),
  onTransfer: vi.fn(),
  onOpenPackage: vi.fn(),
  onAdjustOpen: vi.fn(),
};

function renderSheet(item = stockItem(), props: Partial<React.ComponentProps<typeof StockDetailSheet>> = {}) {
  stockActions.getStockItemAction.mockResolvedValue(item);
  return render(
    <StockDetailSheet
      storeId="s1"
      item={item}
      orders={[]}
      menuProducts={[]}
      resaleNames={[]}
      usedIn={[]}
      open
      onOpenChange={() => {}}
      {...handlers}
      {...props}
    />,
  );
}

describe("StockDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stockActions.deleteMovementAction.mockResolvedValue({ ok: true });
    stockActions.updateMovementAction.mockResolvedValue({ ok: true });
    stockActions.markPackageEmptyAction.mockResolvedValue({ ok: true });
    stockActions.listMovementsAction.mockResolvedValue(page());
  });

  describe("movimentações", () => {
    it("allows editing a manual stock movement from the ledger", async () => {
      stockActions.listMovementsAction.mockResolvedValue(page(movement()));
      const user = userEvent.setup();
      renderSheet();

      await user.click(await screen.findByRole("button", { name: /^Editar compra/ }));
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

    it("keeps linked movements read-only and links the order", async () => {
      stockActions.listMovementsAction.mockResolvedValue(
        page(
          movement({
            id: "mov-sale",
            type: "saida",
            qty: 1,
            byPackage: false,
            price: undefined,
            reason: "VENDA",
            refOrder: "P123",
          }),
        ),
      );
      renderSheet();

      const link = await screen.findByRole("link", { name: "Pedido #P123" });
      expect(link).toHaveAttribute("href", "/s/s1/pedidos?order=P123");
      expect(screen.queryByRole("button", { name: /^Editar .* ·/ })).not.toBeInTheDocument();
    });

    it("allows deleting a manual stock movement from the ledger", async () => {
      stockActions.listMovementsAction.mockResolvedValue(page(movement()));
      const user = userEvent.setup();
      renderSheet();

      await user.click(await screen.findByRole("button", { name: /^Editar compra/ }));
      await user.click(screen.getByRole("button", { name: "Excluir" }));

      await waitFor(() =>
        expect(stockActions.deleteMovementAction).toHaveBeenCalledWith({
          storeId: "s1",
          itemId: "item-1",
          movementId: "mov-1",
        }),
      );
    });

    it("asks the server for the chosen location and type", async () => {
      const user = userEvent.setup();
      renderSheet();
      await waitFor(() => expect(stockActions.listMovementsAction).toHaveBeenCalledWith("s1", "item-1", {}));

      await user.click(within(screen.getByRole("group", { name: "Local" })).getByRole("button", { name: "Depósito" }));
      await waitFor(() =>
        expect(stockActions.listMovementsAction).toHaveBeenLastCalledWith("s1", "item-1", { loc: "deposito" }),
      );

      await user.click(within(screen.getByRole("group", { name: "Tipo" })).getByRole("button", { name: "Transferências" }));
      await waitFor(() =>
        expect(stockActions.listMovementsAction).toHaveBeenLastCalledWith("s1", "item-1", {
          loc: "deposito",
          kind: "transf",
        }),
      );
    });

    it("says so when nothing matches, and groups rows under their day", async () => {
      stockActions.listMovementsAction.mockResolvedValue(page(movement({ at: new Date().toISOString() })));
      renderSheet();
      expect(await screen.findByText("Hoje")).toBeInTheDocument();

      stockActions.listMovementsAction.mockResolvedValue(page());
      const user = userEvent.setup();
      await user.click(within(screen.getByRole("group", { name: "Tipo" })).getByRole("button", { name: "Ajustes" }));
      expect(await screen.findByText("Nenhuma movimentação com esses filtros.")).toBeInTheDocument();
    });

    it("loads older entries from the cursor the server returned", async () => {
      // jsdom has no IntersectionObserver, so the sheet falls back to a "carregar" button
      stockActions.listMovementsAction
        .mockResolvedValueOnce({ rows: [movement({ id: "new" })], next: "2026-01-01T12:00:00.000Z" })
        .mockResolvedValueOnce({ rows: [movement({ id: "old", qty: 9 })], next: null });
      const user = userEvent.setup();
      renderSheet();

      await user.click(await screen.findByRole("button", { name: "carregar" }));
      await waitFor(() =>
        expect(stockActions.listMovementsAction).toHaveBeenLastCalledWith("s1", "item-1", {
          before: "2026-01-01T12:00:00.000Z",
        }),
      );
      expect(await screen.findByRole("button", { name: /\+9 potes/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "carregar" })).not.toBeInTheDocument();
    });
  });

  describe("depósito and loja", () => {
    it("shows what the depósito holds and what the loja holds", async () => {
      renderSheet(stockItem({ cost: 13000 }));
      expect(await screen.findByRole("button", { name: /Transferir Granola do depósito/ })).toHaveTextContent("3 potes");
      expect(screen.getByText("R$ 390,00 parados")).toBeInTheDocument();
      expect(screen.getByText("5 potes")).toBeInTheDocument();
      expect(screen.getByText("mín. 1.000 g")).toBeInTheDocument();
    });

    it("an item below its minimum with stock in the depósito leads with repor, not comprar", async () => {
      const user = userEvent.setup();
      const berry = stockItem({
        name: "CR7 Drive Berry Mix",
        unit: "un",
        pkgLabel: "caixa",
        pkgSize: 12,
        sealed: 0,
        depSealed: 2,
        qty: 0,
        reorderAt: 1,
      });
      renderSheet(berry);

      expect(await screen.findByText(/dá para repor agora/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Comprar" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Repor 2 caixas do depósito" }));
      expect(handlers.onTransfer).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
      await user.click(screen.getByRole("button", { name: "Registrar compra" }));
      expect(handlers.onBuy).toHaveBeenCalled();
    });

    it("comprar hands the item to the purchase dialog", async () => {
      const user = userEvent.setup();
      renderSheet();
      await user.click(await screen.findByRole("button", { name: "Comprar" }));
      expect(handlers.onBuy).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
    });

    it("the depósito tile opens the transfer for this item", async () => {
      const user = userEvent.setup();
      renderSheet();
      await user.click(await screen.findByRole("button", { name: /Transferir Granola do depósito/ }));
      expect(handlers.onTransfer).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
    });

    it("an empty depósito is not a button", async () => {
      renderSheet(stockItem({ depSealed: 0 }));
      await screen.findByText("sem embalagens");
      expect(screen.queryByRole("button", { name: /Transferir Granola do depósito/ })).not.toBeInTheDocument();
    });
  });

  describe("embalagem aberta", () => {
    const pote = (over: Partial<StockItem> = {}) =>
      stockItem({
        name: "Shake Baunilha",
        continuousUse: true,
        consumptionMode: "continuo",
        sealed: 3,
        depSealed: 6,
        ...over,
      });

    it("a pote in use shows its uses and can be marked empty", async () => {
      const user = userEvent.setup();
      renderSheet(pote({ openPkg: true, usos: 14 }));

      expect(await screen.findByText("14 usos")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Marcar vazia" }));
      await waitFor(() => expect(stockActions.markPackageEmptyAction).toHaveBeenCalledWith("s1", "item-1"));
    });

    it("with no pote in use it offers to open one and says where it comes from", async () => {
      const user = userEvent.setup();
      renderSheet(pote({ openPkg: false, lastUsos: 14 }), {
        usedIn: [{ name: "Shake Oreo", qty: 30, unit: "g" }],
      });

      expect(await screen.findByText("Nenhum pote em uso")).toBeInTheDocument();
      // 500 g ÷ 30 g per use = 16 usos previstos → 14 usos is 88%
      expect(screen.getByText(/Último pote rendeu 14 usos/)).toBeInTheDocument();
      expect(screen.getByText("(88% do previsto)")).toBeInTheDocument();
      expect(screen.getByText("Usa 1 dos 3 potes lacrados da loja")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Abrir embalagem" }));
      expect(handlers.onOpenPackage).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
    });

    it("falls back to the depósito when the loja has no sealed pote left", async () => {
      renderSheet(pote({ openPkg: false, sealed: 0, depSealed: 2 }));
      expect(await screen.findByText("Usa 1 dos 2 potes lacrados do depósito")).toBeInTheDocument();
    });

    it("cannot open one when nothing is in stock", async () => {
      renderSheet(pote({ openPkg: false, sealed: 0, depSealed: 0 }));
      expect(await screen.findByRole("button", { name: "Abrir embalagem" })).toBeDisabled();
      expect(screen.getByText("Sem embalagens em estoque")).toBeInTheDocument();
    });

    it("a per-unit item's open package can be adjusted", async () => {
      const user = userEvent.setup();
      renderSheet(
        stockItem({ name: "Copo", unit: "un", pkgLabel: "pacote", pkgSize: 10, sealed: 4, open: 2, qty: 42 }),
      );
      expect(await screen.findByText("Embalagem aberta")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Ajustar" }));
      expect(handlers.onAdjustOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
    });
  });

  describe("custo · rendimento · receitas", () => {
    it("derives the yield and cost per use from what the recipes take per use", async () => {
      renderSheet(
        stockItem({
          name: "Shake Baunilha",
          continuousUse: true,
          consumptionMode: "continuo",
          pkgSize: 550,
          cost: 13000,
          openPkg: true,
          usos: 3,
          lastUsos: 18,
        }),
        { usedIn: [{ name: "Shake Oreo", qty: 30, unit: "g" }, { name: "Shake Ovomaltine", qty: 30, unit: "g" }] },
      );
      // 550 g ÷ 30 g = 18 usos previstos; the last pote served 18 → 100%
      expect(await screen.findByText("18 usos previstos")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("~R$ 7,22 por uso")).toBeInTheDocument();
      expect(screen.getByText("30 g por uso")).toBeInTheDocument();
    });

    it("the Receitas tile lists where the item is used", async () => {
      const user = userEvent.setup();
      renderSheet(stockItem(), { usedIn: [{ name: "Bowl", qty: 40, unit: "g" }] });
      await user.click(await screen.findByRole("button", { name: /Receitas/ }));
      expect(screen.getByText("Usado nas receitas")).toBeInTheDocument();
      expect(screen.getByText("Bowl")).toBeInTheDocument();
    });
  });

  describe("ajustar estoque", () => {
    it("opens the manual entrada/saída panel with the location choice", async () => {
      const user = userEvent.setup();
      stockActions.applyMovementAction.mockResolvedValue({ ok: true });
      renderSheet();

      await user.click(await screen.findByRole("button", { name: "Ajustar estoque" }));
      const onde = screen.getByRole("group", { name: "Onde" });
      await user.click(within(onde).getByRole("button", { name: "Depósito" }));
      await user.type(screen.getByRole("textbox", { name: /Quantidade/ }), "2");
      await user.click(screen.getByRole("button", { name: "Registrar entrada" }));

      await waitFor(() =>
        expect(stockActions.applyMovementAction).toHaveBeenCalledWith(
          expect.objectContaining({ storeId: "s1", itemId: "item-1", type: "entrada", qty: 2, byPackage: true, loc: "deposito" }),
        ),
      );
    });
  });
});
