// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { EstoqueClient } from "./estoque-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/s/s1/estoque",
  useSearchParams: () => new URLSearchParams(),
}));

const adjustOpenBalanceAction = vi.hoisted(() => vi.fn());

vi.mock("@/actions/stock", () => ({
  adjustOpenBalanceAction,
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
        resaleByStock={{}}
        recipeUsage={{}}
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
    // The Situação trigger shows its current option label ("Todos os status") by default.
    await user.click(screen.getByText("Todos os status"));
    await user.click(screen.getByRole("menuitem", { name: /Arquivado/ }));
    expect(screen.getAllByText("SKU Antigo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Morango")).not.toBeInTheDocument();
  });

  describe("per-unit items (Aberto + Ajustar saldo)", () => {
    const copo = stockItem({
      id: "copo",
      name: "Copo Descartável 300 ml",
      category: "descartaveis",
      tracked: true,
      pkgLabel: "pacote",
      pkgSize: 10,
      sealed: 4,
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

    beforeEach(() => {
      adjustOpenBalanceAction.mockReset();
      adjustOpenBalanceAction.mockResolvedValue({ ok: true });
    });

    it("labels the open panel 'Aberto' (never 'Fracionado')", () => {
      renderList({ items: [copo, granola] });
      expect(screen.getAllByText("Aberto").length).toBe(2);
      expect(screen.queryByText("Fracionado")).not.toBeInTheDocument();
    });

    it("shows the remaining units and the per-unit subtitle", () => {
      renderList({ items: [copo] });
      expect(screen.getByText("Restam 2 de 10 un")).toBeInTheDocument();
      expect(screen.getByText("8 un já usadas")).toBeInTheDocument();
      expect(screen.getByText(/consumo por unidade/)).toBeInTheDocument();
    });

    it("only per-unit cards with an open package offer Ajustar saldo", () => {
      renderList({ items: [copo, granola, morango] });
      expect(screen.getAllByTitle("Ajustar saldo")).toHaveLength(1);
    });

    it("opens the adjust dialog (not the detail sheet) from the open panel", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(screen.getByTitle("Ajustar saldo"));

      const dialog = await screen.findByRole("dialog", { name: "Ajustar embalagem aberta" });
      expect(within(dialog).getByText("Saldo calculado pelo sistema")).toBeInTheDocument();
      expect(within(dialog).getByText("2 de 10 un")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Salvar ajuste" })).toBeDisabled();
    });

    it("steps the balance, clamps to the package size and saves the correction", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(screen.getByTitle("Ajustar saldo"));
      const dialog = await screen.findByRole("dialog");

      for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole("button", { name: "Aumentar" }));
      expect(within(dialog).getByLabelText("Unidades restantes de verdade")).toHaveValue("5");
      expect(within(dialog).getByText(/2 → 5 un\./)).toBeInTheDocument();

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

    it("reason is optional and Perda is blocked while the balance goes up", async () => {
      const user = userEvent.setup();
      renderList({ items: [copo] });
      await user.click(screen.getByTitle("Ajustar saldo"));
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
      await user.click(screen.getByTitle("Ajustar saldo"));
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
      await user.click(screen.getByTitle("Ajustar saldo"));
      const dialog = await screen.findByRole("dialog");

      await user.click(within(dialog).getByRole("button", { name: "Diminuir" }));
      await user.click(within(dialog).getByRole("button", { name: "Salvar ajuste" }));
      await waitFor(() => expect(adjustOpenBalanceAction).toHaveBeenCalled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
