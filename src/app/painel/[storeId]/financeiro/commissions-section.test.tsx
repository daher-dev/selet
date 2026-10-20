// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommissionPayment, FinanceTx } from "@/lib/types";
import { CommissionsSection, sellerCommissions } from "./commissions-section";

vi.mock("@/actions/commissions", () => ({
  registerCommissionPaymentAction: vi.fn().mockResolvedValue({ ok: true }),
  undoCommissionPaymentAction: vi.fn().mockResolvedValue({ ok: true }),
  listCommissionItemsAction: vi.fn().mockResolvedValue({ ok: true, rows: [] }),
}));

const mirror = (p: Partial<FinanceTx>): FinanceTx => ({
  id: Math.random().toString(36),
  label: "Pedido",
  category: "vendas",
  amount: 10000,
  direction: "in",
  source: "order",
  date: "2026-07-15T15:00:00Z",
  sellerEmail: "marina@selet.com.br",
  sellerName: "Marina Alves",
  commission: { amount: 500, base: 10000, items: 2 },
  ...p,
});

const payment = (p: Partial<CommissionPayment> = {}): CommissionPayment => ({
  id: "pay1",
  sellerEmail: "marina@selet.com.br",
  sellerName: "Marina Alves",
  month: "2026-07",
  amount: 1000,
  paidAt: "2026-08-01T15:00:00Z",
  ...p,
});

describe("sellerCommissions", () => {
  it("sums the month's accrued commission per seller and subtracts payouts", () => {
    const rows = sellerCommissions(
      [
        mirror({}),
        mirror({ commission: { amount: 500, base: 10000, items: 1 } }),
        mirror({ sellerEmail: "bruno@selet.com.br", sellerName: "Bruno", commission: { amount: 200, base: 4000, items: 1 } }),
        mirror({ date: "2026-06-30T15:00:00Z" }), // other month
        mirror({ commission: undefined }), // no commission earned
      ],
      [payment({ amount: 400 })],
      "2026-07",
    );
    expect(rows.map((r) => [r.name, r.amount, r.items, r.paid])).toEqual([
      ["Marina Alves", 1000, 3, 400],
      ["Bruno", 200, 1, 0],
    ]);
  });
});

describe("CommissionsSection", () => {
  const props = { storeId: "s1", month: "2026-07", monthName: "Julho" };

  it("renders nothing for a month without commissions", () => {
    const { container } = render(
      <CommissionsSection {...props} transactions={[mirror({ commission: undefined })]} payments={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to register the payment while something is owed", () => {
    render(<CommissionsSection {...props} transactions={[mirror({})]} payments={[]} />);
    expect(screen.getByRole("heading", { name: "Comissões de julho" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar pagamento/ })).toBeInTheDocument();
  });

  it("shows 'Pago em' once the payouts cover the commission", () => {
    render(
      <CommissionsSection {...props} transactions={[mirror({})]} payments={[payment({ amount: 500 })]} />,
    );
    expect(screen.getByText(/Pago em 01\/08/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar pagamento/ })).not.toBeInTheDocument();
  });
});
