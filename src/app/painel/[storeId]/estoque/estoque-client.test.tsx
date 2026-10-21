// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { EstoqueClient } from "./estoque-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/painel/s1/estoque",
  useSearchParams: () => new URLSearchParams(),
}));

const adjustOpenBalanceAction = vi.hoisted(() => vi.fn());
const transferToStoreAction = vi.hoisted(() => vi.fn());

vi.mock("@/actions/stock", () => ({
  adjustOpenBalanceAction,
  transferToStoreAction,
  createStockItemAction: vi.fn(),
  updateStockItemAction: vi.fn(),
  deleteStockItemAction: vi.fn(),
  applyMovementAction: vi.fn(),
  listMovementsAction: vi.fn().mockResolvedValue({ rows: [], next: null }),
  getStockItemAction: vi.fn(),
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
    depSealed: 0,
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

// A resale drink that sold out in the Loja while the Depósito still holds 2 caixas.
const berry = stockItem({
  id: "berry",
  name: "CR7 Drive Berry Mix",
  category: "bebidas",
  tracked: true,
  pkgLabel: "caixa",
  pkgSize: 12,
  sealed: 0,
  depSealed: 2,
  qty: 0,
  reorderAt: 2,
  resellable: true,
});

function renderList(props: Partial<React.ComponentProps<typeof EstoqueClient>> = {}) {
  return render(
    <AppShellProvider routeKey="/painel/s1/estoque">
      <EstoqueClient
        storeId="s1"
        storeName="Vila Velha/ES"
        items={items}
        orders={[]}
        menuProducts={[]}
        resaleByStock={{}}
        recipeUsage={{}}
        {...props}
      />
    </AppShellProvider>,
  );
}

describe("EstoqueClient", () => {
  it("hides archived items in the default view", () => {
    renderList();
    expect(screen.getAllByText("Morango").length).toBeGreaterThan(0);
    expect(screen.queryByText("SKU Antigo")).not.toBeInTheDocument();
  });

  it("shows only archived items when the Arquivados chip is selected", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Arquivados · 1" }));
    expect(screen.getAllByText("SKU Antigo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Morango")).not.toBeInTheDocument();
  });

  it("only offers the Arquivados chip when something is archived", () => {
    renderList({ items: [morango] });
    expect(screen.queryByRole("button", { name: /Arquivados/ })).not.toBeInTheDocument();
  });

  describe("Loja and Depósito", () => {
    it("shows both rows on each card: Loja with its status pill, Depósito with the units it holds", () => {
      renderList({ items: [berry] });
      expect(screen.getByText("Esgotado")).toBeInTheDocument();
      expect(screen.getByText("0 caixas")).toBeInTheDocument();
      expect(screen.getByText("2 caixas")).toBeInTheDocument();
      expect(screen.getByText("24 un")).toBeInTheDocument();
    });

    it("reads 'vazio' for an empty Depósito and gives untracked items no Depósito row", () => {
      const empty = { ...berry, id: "empty", name: "Sem depósito", depSealed: 0 };
      renderList({ items: [empty, morango] });
      expect(screen.getAllByText("vazio")).toHaveLength(1);
      // one Depósito row (the empty one) — Morango is untracked and has none
      expect(screen.getAllByRole("button", { name: /^Depósito vazio de|^Transferir .* do depósito/ })).toHaveLength(1);
    });

    it("counts the status chips: attention = abaixo do mínimo or esgotado", async () => {
      const user = userEvent.setup();
      renderList({ items: [berry, morango] });
      expect(screen.getByRole("button", { name: "Todos · 2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Precisa de atenção · 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Em dia · 1" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Precisa de atenção · 1" }));
      expect(screen.getAllByText("CR7 Drive Berry Mix").length).toBeGreaterThan(0);
      expect(screen.queryByText("Morango")).not.toBeInTheDocument();
    });

    it("'Onde' narrows to what is in the Loja or in the Depósito", async () => {
      const user = userEvent.setup();
      const noDep = { ...berry, id: "nodep", name: "Sem depósito", depSealed: 0 };
      renderList({ items: [berry, noDep] });

      await user.click(screen.getByRole("button", { name: "Depósito" }));
      expect(screen.getAllByText("CR7 Drive Berry Mix").length).toBeGreaterThan(0);
      expect(screen.queryByText("Sem depósito")).not.toBeInTheDocument();
      // the Loja row is hidden in the depósito view
      expect(screen.queryByText("0 caixas")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Loja" }));
      expect(screen.getAllByText("Sem depósito").length).toBeGreaterThan(0);
      expect(screen.getByRole("group", { name: "Onde" })).toBeInTheDocument();
      expect(screen.queryByText("2 caixas")).not.toBeInTheDocument();
    });

    it("the Depósito row opens Transferir para a loja with that item ready to go", async () => {
      transferToStoreAction.mockResolvedValue({ ok: true, trCode: "TR-0088" });
      const user = userEvent.setup();
      renderList({ items: [berry] });

      await user.click(screen.getByRole("button", { name: /Transferir CR7 Drive Berry Mix do depósito/ }));
      const sheet = await screen.findByRole("dialog", { name: "Transferir para a loja" });
      expect(within(sheet).getByText("Depósito 2 → 0 caixas")).toBeInTheDocument();
      expect(within(sheet).getByText("Loja 0 → 24 un")).toBeInTheDocument();

      await user.click(within(sheet).getByRole("button", { name: "Transferir 1 item" }));
      await waitFor(() =>
        expect(transferToStoreAction).toHaveBeenCalledWith({
          storeId: "s1",
          lines: [{ itemId: "berry", qty: 2 }],
          note: undefined,
        }),
      );
    });
  });

  describe("per-unit items (Ajustar embalagem aberta)", () => {
    const copo = stockItem({
      id: "copo",
      name: "Copo Descartável 300 ml",
      category: "descartaveis",
      tracked: true,
      pkgLabel: "pacote",
      pkgSize: 10,
      sealed: 4,
      depSealed: 12,
      open: 2,
      qty: 42,
    });
    const granola = stockItem({
      id: "granola",
      name: "Granola",
      unit: "g",
      tracked: true,
      pkgLabel: "pote",
      pkgSize: 500,
      sealed: 2,
      open: 0,
      qty: 1000,
      continuousUse: true,
      consumptionMode: "continuo",
    });

    const adjustButton = () => screen.getByTitle("Ajustar embalagem aberta");

    beforeEach(() => {
      adjustOpenBalanceAction.mockReset();
      adjustOpenBalanceAction.mockResolvedValue({ ok: true });
    });

    it("the Loja row counts the loose units of the open package", () => {
      renderList({ items: [copo] });
      expect(screen.getByText("4 pacotes + 2 un")).toBeInTheDocument();
    });

    it("only per-unit cards with an open package offer the adjustment", () => {
      renderList({ items: [copo, granola, morango] });
      expect(screen.getAllByTitle("Ajustar embalagem aberta")).toHaveLength(1);
    });

    it("opens the adjust dialog (not the detail sheet) from the Loja row", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(adjustButton());

      const dialog = await screen.findByRole("dialog", { name: "Ajustar embalagem aberta" });
      expect(within(dialog).getByText("Loja")).toBeInTheDocument();
      expect(within(dialog).getByText("de 10 un")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Salvar ajuste" })).toBeDisabled();
    });

    it("steps the balance, clamps to the package size and saves the correction", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(adjustButton());
      const dialog = await screen.findByRole("dialog");

      for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole("button", { name: "Aumentar" }));
      expect(within(dialog).getByLabelText("Unidades restantes de verdade")).toHaveValue("5");

      for (let i = 0; i < 20; i++) await user.click(within(dialog).getByRole("button", { name: "Aumentar" }));
      expect(within(dialog).getByLabelText("Unidades restantes de verdade")).toHaveValue("10");
      expect(within(dialog).getByRole("button", { name: "Aumentar" })).toBeDisabled();

      await user.clear(within(dialog).getByLabelText("Unidades restantes de verdade"));
      await user.type(within(dialog).getByLabelText("Unidades restantes de verdade"), "5");
      await user.click(within(dialog).getByRole("button", { name: "Salvar ajuste" }));

      await waitFor(() =>
        expect(adjustOpenBalanceAction).toHaveBeenCalledWith({
          storeId: "s1",
          itemId: "copo",
          open: 5,
          reason: "CONTAGEM",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("Perda is blocked while the balance goes up; the reason can be cleared", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(adjustButton());
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Aumentar" }));
      expect(within(dialog).getByRole("button", { name: "Perda" })).toBeDisabled();

      // Deselect the preselected reason → no reason is sent.
      await user.click(within(dialog).getByRole("button", { name: "Contagem errada" }));
      await user.click(within(dialog).getByRole("button", { name: "Salvar ajuste" }));
      await waitFor(() =>
        expect(adjustOpenBalanceAction).toHaveBeenCalledWith({ storeId: "s1", itemId: "copo", open: 3, reason: undefined }),
      );
    });

    it("lowering the balance can be booked as Perda", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(adjustButton());
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Diminuir" }));
      await user.click(within(dialog).getByRole("button", { name: "Perda" }));
      await user.click(within(dialog).getByRole("button", { name: "Salvar ajuste" }));
      await waitFor(() =>
        expect(adjustOpenBalanceAction).toHaveBeenCalledWith({ storeId: "s1", itemId: "copo", open: 1, reason: "PERDA" }),
      );
    });

    it("keeps the dialog open and reports the error when the action fails", async () => {
      adjustOpenBalanceAction.mockResolvedValue({ ok: false, error: "Algo deu errado." });
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(adjustButton());
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Diminuir" }));
      await user.click(within(dialog).getByRole("button", { name: "Salvar ajuste" }));
      await waitFor(() => expect(adjustOpenBalanceAction).toHaveBeenCalled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
