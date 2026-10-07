// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cartela } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { CartelasClient } from "./cartelas-client";

vi.mock("@/actions/cartelas", () => ({
  cancelCartelaAction: vi.fn(),
  markManualCartelaUseAction: vi.fn(),
}));

function cartela(over: Partial<Cartela> = {}): Cartela {
  return {
    id: "abcd1234",
    code: "ABCD",
    customerId: "c1",
    customerName: "Mariana Lopes",
    paidUses: 10,
    totalUses: 11,
    unitValue: 3000,
    amount: 30000,
    uses: [],
    status: "ativa",
    soldOnOrderId: "o1",
    purchasedAt: "2026-10-03T12:00:00.000Z",
    createdAt: "2026-10-03T12:00:00.000Z",
    updatedAt: "2026-10-03T12:00:00.000Z",
    ...over,
  };
}

function orderUse(at: string) {
  return { kind: "order" as const, orderId: "o1", orderCode: "O001", productName: "Shake", at };
}

// "Today" is 2026-10-15: window Mai…Out, current month Out.
const cartelas = [
  // Sold this month, 2 uses this month → balance (11 − 2) × 3000 = 27000.
  cartela({ uses: [orderUse("2026-10-04T12:00:00.000Z"), orderUse("2026-10-09T12:00:00.000Z")] }),
  // Sold in July, 1 use in August, 1 in October → balance (6 − 2) × 2200 = 8800; not a sale of this month.
  cartela({
    id: "efgh5678",
    code: "EFGH",
    customerName: "Beatriz Almeida",
    paidUses: 5,
    totalUses: 6,
    unitValue: 2200,
    amount: 11000,
    purchasedAt: "2026-07-10T12:00:00.000Z",
    uses: [orderUse("2026-08-02T12:00:00.000Z"), orderUse("2026-10-12T12:00:00.000Z")],
  }),
  // Cancelled cartelas are excluded everywhere.
  cartela({ id: "ijkl9012", code: "IJKL", customerName: "Cancelada", status: "cancelada" }),
];

function renderClient() {
  return render(
    <AppShellProvider routeKey="/s/s1/cartelas">
      <CartelasClient storeId="s1" cartelas={cartelas} />
    </AppShellProvider>,
  );
}

const card = (title: string) => screen.getByText(title).closest("div.rounded-\\[14px\\]") as HTMLElement;
/** The big "este mês" number of a stat card (bar values are separate, hidden-until-hover labels). */
const headline = (c: HTMLElement) => c.querySelector("span.tabular")?.textContent?.replace(/\u00a0/g, " ");

describe("CartelasClient stat cards", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T15:00:00.000Z") });
  });
  afterEach(() => vi.useRealTimers());

  it("shows this month's headline figures", () => {
    renderClient();
    expect(headline(card("Saldo em circulação"))).toBe("R$ 358,00");
    expect(headline(card("Vendido"))).toBe("R$ 300,00");
    expect(headline(card("Usos resgatados"))).toBe("3");
    expect(screen.getAllByText("este mês")).toHaveLength(3);
  });

  it("charts the last 6 months, the current one last", () => {
    renderClient();
    const bars = within(screen.getByRole("group", { name: "Saldo em circulação por mês" })).getAllByRole("button");
    expect(bars.map((b) => b.getAttribute("aria-label")?.split(":")[0])).toEqual(["Mai", "Jun", "Jul", "Ago", "Set", "Out"]);
    // Jul: Beatriz's cartela only (6 uses left × 2200).
    expect(bars[2]).toHaveAttribute("aria-label", "Jul: R$ 132");
  });

  it("switches the Vendido card between R$ and Unid.", async () => {
    const user = userEvent.setup();
    renderClient();
    const vendido = card("Vendido");
    expect(within(vendido).getByRole("button", { name: "Valor vendido em reais" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Vendido por mês (R$)" })).toBeInTheDocument();

    await user.click(within(vendido).getByRole("button", { name: "Cartelas vendidas em unidades" }));

    const units = card("Cartelas vendidas");
    expect(headline(units)).toBe("1"); // one sale in October
    expect(screen.queryByText("Vendido")).not.toBeInTheDocument();
    const bars = within(screen.getByRole("group", { name: "Cartelas vendidas por mês (unidades)" })).getAllByRole("button");
    expect(bars[2]).toHaveAttribute("aria-label", "Jul: 1"); // Beatriz's sale
    expect(bars[5]).toHaveAttribute("aria-label", "Out: 1");

    await user.click(within(units).getByRole("button", { name: "Valor vendido em reais" }));
    expect(screen.getByText("Vendido")).toBeInTheDocument();
  });

  it("reveals a bar's value on hover, focus and tap", async () => {
    const user = userEvent.setup();
    renderClient();
    const group = screen.getByRole("group", { name: "Usos resgatados por mês" });
    const [may] = within(group).getAllByRole("button");
    // Hidden by default (transparent), shown in brand green when active.
    const value = () => within(may).getByText("0");
    expect(value()).toHaveClass("text-transparent");

    await user.hover(may);
    expect(value()).toHaveClass("text-primary");
    await user.unhover(may);
    expect(value()).toHaveClass("text-transparent");

    await user.click(may); // tap pins it
    await user.unhover(may);
    expect(value()).toHaveClass("text-primary");
    expect(may).toHaveAttribute("aria-pressed", "true");
    await user.click(may);
    await user.unhover(may);
    expect(value()).toHaveClass("text-transparent");
  });
});
