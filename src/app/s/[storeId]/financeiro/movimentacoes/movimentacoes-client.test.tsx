// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FinanceTx } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { MovimentacoesClient } from "./movimentacoes-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/s/s1/financeiro/movimentacoes",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    href: string;
    onClick?: (e: React.MouseEvent) => void;
  }>) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/actions/finance", () => ({
  createManualTxAction: vi.fn().mockResolvedValue({ ok: true }),
  updateManualTxAction: vi.fn().mockResolvedValue({ ok: true }),
  deleteManualTxAction: vi.fn().mockResolvedValue({ ok: true }),
}));

function financeTx(overrides: Partial<FinanceTx>): FinanceTx {
  return {
    id: Math.random().toString(36).slice(2),
    label: "Lançamento",
    category: "outros",
    amount: 10000,
    direction: "out",
    source: "manual",
    date: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

const avulso = financeTx({
  id: "avulso-1",
  label: "Aluguel · Vila Velha",
  category: "aluguel",
  direction: "out",
  source: "manual",
});
const vinculadoPedido = financeTx({
  id: "pedido-1",
  label: "Pedido #AB12 · Ana Beatriz",
  direction: "in",
  source: "order",
  orderId: "orderAB12xyz",
});
const vinculadoEstoque = financeTx({
  id: "stock-1",
  label: "Compra · Shake Morango",
  direction: "out",
  source: "stock",
  stockItemId: "item-1",
});

function renderPage(transactions: FinanceTx[] = [avulso, vinculadoPedido, vinculadoEstoque]) {
  return render(
    <AppShellProvider routeKey="/s/s1/financeiro/movimentacoes">
      <MovimentacoesClient
        storeId="s1"
        mes="2026-07"
        transactions={transactions}
        stockItemNames={{ "item-1": "Shake Morango 550g" }}
      />
    </AppShellProvider>,
  );
}

describe("MovimentacoesClient", () => {
  it("filter pills narrow the visible rows", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByText("Aluguel · Vila Velha").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pedido #AB12/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Compra · Shake Morango/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Avulsos" }));
    expect(screen.getAllByText("Aluguel · Vila Velha").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pedido #AB12/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compra · Shake Morango/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vinculados" }));
    expect(screen.queryByText("Aluguel · Vila Velha")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Pedido #AB12/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Compra · Shake Morango/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Entradas" }));
    expect(screen.getAllByText(/Pedido #AB12/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Compra · Shake Morango/)).not.toBeInTheDocument();
  });

  it("avulso rows expose delete; vinculado rows show the lock icon instead", () => {
    renderPage();
    // One avulso row, rendered once for desktop + once for the mobile card
    // stack → two delete affordances.
    expect(screen.getAllByLabelText("Excluir lançamento")).toHaveLength(2);
    // Two vinculado rows → two lock tooltips (one per data-table instance).
    expect(screen.getAllByTitle("Vinculado ao pedido — edite pelo pedido").length).toBeGreaterThan(0);
    expect(
      screen.getAllByTitle("Vinculado ao estoque — edite pela entrada de estoque").length,
    ).toBeGreaterThan(0);
  });

  it("clicking an avulso row opens the edit sheet", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByText("Aluguel · Vila Velha")[0]);
    expect(await screen.findByText("Editar lançamento")).toBeInTheDocument();
  });

  it("clicking a vinculado row opens the read-only sheet", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByText(/Pedido #AB12/)[0]);
    expect(await screen.findByText("Lançamento vinculado")).toBeInTheDocument();
  });

  it("clicking the Origem chip does not also open the row's own sheet", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByText("Shake Morango 550g")[0]);
    expect(screen.queryByText("Lançamento vinculado")).not.toBeInTheDocument();
  });
});
