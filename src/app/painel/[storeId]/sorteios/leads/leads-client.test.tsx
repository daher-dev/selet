// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { convertLeadAction, linkLeadAction } from "@/actions/raffles";
import type { LeadView } from "@/data/raffles";
import { LeadsClient } from "./leads-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/painel/s1/sorteios/leads",
}));
vi.mock("@/actions/raffles", () => ({
  linkLeadAction: vi.fn(async () => ({ ok: true })),
  convertLeadAction: vi.fn(async () => ({ ok: true })),
}));

const lead = (over: Partial<LeadView>): LeadView => ({
  id: "27999990001",
  name: "Juliana Prado",
  phone: "27999990001",
  instagram: "juprado",
  novidades: false,
  raffleIds: ["r1"],
  raffleNames: ["Aniversário 3 anos"],
  createdAt: new Date().toISOString(),
  lastAt: new Date().toISOString(),
  kind: "novo",
  customerId: null,
  match: null,
  wonRaffleIds: [],
  ...over,
});

const leads = [
  lead({}),
  lead({ id: "27999990002", phone: "27999990002", name: "Thiago Ramos", instagram: "thiramos", match: { id: "c1", name: "Thiago R.", orderCount: 2, since: "2023-03-01T12:00:00Z" } }),
  lead({ id: "27999990003", phone: "27999990003", name: "Carla Menezes", instagram: "carlamenezes", kind: "vinc", customerId: "c2", match: { id: "c2", name: "Carla Menezes", orderCount: 41, since: "2023-03-01T12:00:00Z" } }),
];

function renderLeads() {
  return render(
    <AppShellProvider routeKey="/painel/s1/sorteios/leads">
      <LeadsClient
        storeId="s1"
        leads={leads}
        customers={[]}
        raffleCount={3}
        novos={2}
        raffleFilter={null}
        raffleFilterName={null}
      />
    </AppShellProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("LeadsClient", () => {
  it("counts leads by situation and filters by chip", async () => {
    renderLeads();
    expect(screen.getByRole("button", { name: "Todos · 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novos · 2" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vinculados · 1" }));
    expect(screen.getAllByText("Carla Menezes").length).toBeGreaterThan(0);
    expect(screen.queryByText("Juliana Prado")).not.toBeInTheDocument();
  });

  it("searches by name, @ or WhatsApp", async () => {
    renderLeads();
    await userEvent.type(screen.getByLabelText("Buscar lead"), "@thiramos");
    expect(screen.getAllByText("Thiago Ramos").length).toBeGreaterThan(0);
    expect(screen.queryByText("Juliana Prado")).not.toBeInTheDocument();
  });

  it("links a lead to the customer with the same WhatsApp, or turns it into a new customer", async () => {
    renderLeads();
    await userEvent.click(screen.getAllByRole("button", { name: "Vincular a Thiago R." })[0]);
    expect(linkLeadAction).toHaveBeenCalledWith("s1", "27999990002", "c1");
    await userEvent.click(screen.getAllByRole("button", { name: "Virar cliente" })[0]);
    expect(convertLeadAction).toHaveBeenCalledWith("s1", "27999990001");
  });
});
