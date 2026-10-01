// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MonthPoint } from "@/lib/dashboard-core";
import { ChannelStackChart, CustomerSplitChart, MonthlySalesChart } from "./evolution-charts";
import { EntradaSaidaChart, TicketChart } from "./finance-charts";

function month(key: string, over: Partial<MonthPoint> = {}): MonthPoint {
  return {
    key,
    label: key.slice(5),
    sales: 0,
    mom: null,
    partial: false,
    orderCount: 0,
    channels: { instagram: 0, whatsapp: 0, loja: 0 },
    novos: 0,
    recorrentes: 0,
    in: 0,
    out: 0,
    avgTicket: 0,
    activeCustomers: 0,
    ...over,
  };
}

const months: MonthPoint[] = [
  month("2026-01", {
    sales: 150_000,
    mom: -12.5,
    orderCount: 10,
    channels: { instagram: 6, whatsapp: 3, loja: 1 },
    novos: 4,
    recorrentes: 6,
    in: 200_000,
    out: 50_000,
    avgTicket: 15_000,
    activeCustomers: 10,
  }),
  month("2026-02", {
    sales: 250_000,
    mom: 66.7,
    orderCount: 12,
    channels: { instagram: 2, whatsapp: 2, loja: 8 },
    novos: 3,
    recorrentes: 9,
    in: 300_000,
    out: 400_000,
    avgTicket: 20_833,
    activeCustomers: 12,
  }),
  month("2026-03", { partial: true, sales: 100_000, orderCount: 5, in: 100_000, activeCustomers: 5, avgTicket: 20_000 }),
];

/** The hover targets of a chart, in month order. */
function columns(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGRectElement>("[data-hover-col]"));
}

function seriesRects(container: HTMLElement, series: string) {
  return container.querySelectorAll(`[data-series="${series}"]`);
}

describe("chart tooltips", () => {
  it("MonthlySalesChart shows exact figures for the hovered month and clears on leave", async () => {
    const user = userEvent.setup();
    const { container } = render(<MonthlySalesChart months={months} />);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.hover(columns(container)[1]);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("Fevereiro de 2026")).toBeInTheDocument();
    expect(tip).toHaveTextContent(/R\$\s*2\.500,00/);
    expect(tip).toHaveTextContent("+66,7%");
    expect(tip).toHaveTextContent("12");

    await user.unhover(columns(container)[1]);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("flags the open month as parcial", async () => {
    const user = userEvent.setup();
    const { container } = render(<MonthlySalesChart months={months} />);
    await user.hover(columns(container)[2]);
    expect(within(screen.getByRole("tooltip")).getByText("parcial")).toBeInTheDocument();
  });

  it("opens from keyboard focus, moves with the arrow keys and closes on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(<MonthlySalesChart months={months} />);
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Janeiro de 2026");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Fevereiro de 2026");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    // One tab stop per chart, not one per month.
    expect(columns(container).filter((c) => c.tabIndex === 0)).toHaveLength(1);
  });

  it("names every column with the same figures for assistive tech", () => {
    const { container } = render(<MonthlySalesChart months={months} />);
    expect(columns(container)[0]).toHaveAccessibleName(/Janeiro de 2026.*Faturamento.*1\.500,00/);
  });
});

describe("legend toggles", () => {
  it("ChannelStackChart: hiding a channel removes it, renormalises the rest and drops it from the tooltip", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChannelStackChart months={months} />);
    expect(seriesRects(container, "instagram")).toHaveLength(2);

    await user.hover(columns(container)[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Instagram.*6 pedidos · 60%/);
    await user.unhover(columns(container)[0]);

    const btn = screen.getByRole("button", { name: "Instagram" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(seriesRects(container, "instagram")).toHaveLength(0);
    expect(seriesRects(container, "whatsapp")).toHaveLength(2);

    await user.hover(columns(container)[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip).not.toHaveTextContent("Instagram");
    // 3 whatsapp + 1 loja left: 75% / 25%
    expect(tip).toHaveTextContent(/WhatsApp.*3 pedidos · 75%/);
    expect(tip).toHaveTextContent(/Total.*4 pedidos/);

    await user.click(btn);
    expect(seriesRects(container, "instagram")).toHaveLength(2);
  });

  it("never lets the last visible series be hidden", async () => {
    const user = userEvent.setup();
    const { container } = render(<CustomerSplitChart months={months} />);
    await user.click(screen.getByRole("button", { name: "Novos" }));
    expect(seriesRects(container, "novos")).toHaveLength(0);

    const last = screen.getByRole("button", { name: "Recorrentes" });
    expect(last).toHaveAttribute("aria-disabled", "true");
    await user.click(last);
    expect(last).toHaveAttribute("aria-pressed", "true");
    // Jan + Fev have recorrentes; the open month has none.
    expect(seriesRects(container, "recorrentes")).toHaveLength(2);
  });

  it("CustomerSplitChart: tooltip lists visible series and a total", async () => {
    const user = userEvent.setup();
    const { container } = render(<CustomerSplitChart months={months} />);
    await user.hover(columns(container)[1]);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/Recorrentes.*9/);
    expect(tip).toHaveTextContent(/Novos.*3/);
    expect(tip).toHaveTextContent(/Total.*12/);
  });

  it("EntradaSaidaChart: shows saldo with both series, hides it (and the bars) with one", async () => {
    const user = userEvent.setup();
    const { container } = render(<EntradaSaidaChart months={months} />);
    await user.hover(columns(container)[1]);
    let tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/Entradas.*3\.000,00/);
    expect(tip).toHaveTextContent(/Saídas.*4\.000,00/);
    expect(tip).toHaveTextContent(/Saldo.*1\.000,00/);
    await user.unhover(columns(container)[1]);

    await user.click(screen.getByRole("button", { name: "Saídas" }));
    expect(seriesRects(container, "out")).toHaveLength(0);
    expect(seriesRects(container, "in")).toHaveLength(3);
    await user.hover(columns(container)[1]);
    tip = screen.getByRole("tooltip");
    expect(tip).not.toHaveTextContent("Saídas");
    expect(tip).not.toHaveTextContent("Saldo");
  });

  it("TicketChart: each series toggles independently, along with its axis title", async () => {
    const user = userEvent.setup();
    const { container } = render(<TicketChart months={months} />);
    expect(screen.getByText("Ticket médio (R$)")).toBeInTheDocument();
    expect(screen.getByText("Clientes ativos (nº)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ticket médio" }));
    expect(seriesRects(container, "ticket")).toHaveLength(0);
    expect(screen.queryByText("Ticket médio (R$)")).toBeNull();
    expect(seriesRects(container, "clientes")).toHaveLength(3);

    await user.hover(columns(container)[0]);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/Clientes ativos.*10/);
    expect(tip).not.toHaveTextContent("Ticket médio");
    await user.unhover(columns(container)[0]);

    await user.click(screen.getByRole("button", { name: "Ticket médio" }));
    await user.click(screen.getByRole("button", { name: "Clientes ativos" }));
    expect(screen.queryByText("Clientes ativos (nº)")).toBeNull();
    expect(seriesRects(container, "ticket").length).toBeGreaterThan(0);
    await user.hover(columns(container)[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Ticket médio.*208,33/);
  });
});
