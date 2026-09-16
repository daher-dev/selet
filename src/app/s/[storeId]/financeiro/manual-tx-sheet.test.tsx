// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FinanceTx } from "@/lib/types";
import { ManualTxSheet } from "./manual-tx-sheet";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
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
    id: "tx-1",
    label: "Aluguel · Vila Velha",
    category: "aluguel",
    amount: 420000,
    direction: "out",
    source: "manual",
    date: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("ManualTxSheet", () => {
  it("create mode: no editingTx → 'Novo lançamento', no Excluir", () => {
    render(<ManualTxSheet storeId="s1" open onOpenChange={() => {}} />);
    expect(screen.getByText("Novo lançamento")).toBeInTheDocument();
    expect(screen.queryByText("Excluir")).not.toBeInTheDocument();
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
    expect(screen.getByText("Salvar")).toBeInTheDocument();
  });

  it("edit mode: manual source → 'Editar lançamento', shows author, has Excluir", () => {
    const tx = financeTx({ createdBy: "Júlia" });
    render(
      <ManualTxSheet storeId="s1" open editingTx={tx} onOpenChange={() => {}} />,
    );
    expect(screen.getByText("Editar lançamento")).toBeInTheDocument();
    expect(screen.getByText(/Avulso · criado em/)).toHaveTextContent("por Júlia");
    expect(screen.getByText("Excluir")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Aluguel · Vila Velha")).toBeInTheDocument();
  });

  it("edit mode: gracefully omits the author clause when createdBy is absent", () => {
    const tx = financeTx({ createdBy: undefined });
    render(
      <ManualTxSheet storeId="s1" open editingTx={tx} onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Avulso · criado em/)).not.toHaveTextContent("por");
  });

  it("read-only mode: order source → 'Lançamento vinculado', Origem links to the order, no Salvar/Excluir", () => {
    const tx = financeTx({
      id: "order-o1",
      source: "order",
      orderId: "orderXYZ123",
      direction: "in",
      label: "Pedido #XYZ1 · Ana Beatriz",
    });
    render(
      <ManualTxSheet storeId="s1" open editingTx={tx} onOpenChange={() => {}} />,
    );
    expect(screen.getByText("Lançamento vinculado")).toBeInTheDocument();
    expect(screen.getByText("Gerado automaticamente · somente leitura")).toBeInTheDocument();
    expect(screen.queryByText("Salvar")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluir")).not.toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/s/s1/pedidos?order=orderXYZ123");
  });

  it("read-only mode: stock source → Origem links to the stock item using the resolved name", () => {
    const tx = financeTx({
      id: "stock-s1",
      source: "stock",
      stockItemId: "item-9",
      label: "Compra · Shake Morango 550g",
    });
    render(
      <ManualTxSheet
        storeId="s1"
        open
        editingTx={tx}
        stockItemNames={{ "item-9": "Shake Morango 550g" }}
        onOpenChange={() => {}}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/s/s1/estoque?item=item-9");
    expect(link).toHaveTextContent("Shake Morango 550g");
  });

  it("read-only mode: a stock tx whose item id can't be resolved shows a non-link fallback", () => {
    const tx = financeTx({ id: "stock-s2", source: "stock", stockItemId: undefined });
    render(
      <ManualTxSheet storeId="s1" open editingTx={tx} onOpenChange={() => {}} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Item removido")).toBeInTheDocument();
  });
});
