// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { monthKey } from "@/lib/summary-core";
import { FinanceiroClient } from "./financeiro-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

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
  deleteManualTxAction: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("FinanceiroClient", () => {
  it("links 'Ver todas' to the Movimentações list, scoped to the currently-selected competência", () => {
    render(
      <AppShellProvider routeKey="/s/s1/financeiro">
        <FinanceiroClient
          storeId="s1"
          receivablesByMonth={{}}
          months={[]}
          transactions={[]}
        />
      </AppShellProvider>,
    );

    const currentMonthKey = monthKey(new Date());
    const link = screen.getByRole("link", { name: /Ver todas/ });
    expect(link).toHaveAttribute(
      "href",
      `/s/s1/financeiro/movimentacoes?mes=${currentMonthKey}`,
    );
  });
});
