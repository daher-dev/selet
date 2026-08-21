// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Customer, Order } from "@/lib/types";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { setCustomerArchivedAction } from "@/actions/customers";
import { ClientesClient } from "./clientes-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/s/s1/clientes",
}));

vi.mock("@/actions/customers", () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(async () => ({ ok: true })),
  setCustomerArchivedAction: vi.fn(async () => ({ ok: true })),
}));

function customer(overrides: Partial<Customer>): Customer {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Cliente",
    since: "2026-01-01T12:00:00.000Z",
    tags: [],
    archived: false,
    orderCount: 0,
    totalSpent: 0,
    lastOrderAt: null,
    avgReorderDays: null,
    ...overrides,
  };
}

const maria = customer({ id: "maria", name: "Maria Silva", tags: ["vip"] });
const joao = customer({ id: "joao", name: "João Souza", phone: "(27) 90000-1234" });
const ana = customer({ id: "ana", name: "Ana Arquivada", archived: true });
const customers = [maria, joao, ana];

// One unpaid order for João → he shows under the "A receber" segment.
const orders: Order[] = [
  {
    id: "o1",
    code: "0001",
    customerId: "joao",
    customerName: "João Souza",
    channel: "whatsapp",
    items: [{ productId: "p1", name: "Shake", qty: 1, unitPrice: 2000 }],
    total: 2000,
    status: "novo",
    paid: false,
    payMethod: null,
    createdAt: "2026-06-01T12:00:00.000Z",
  } as Order,
];

// ClientesClient reads the global header search via useShellSearch, so it must
// render inside the shell provider (the real app always does). The page keeps
// its own local search box; the shell search stays empty here.
function renderList(props: Partial<React.ComponentProps<typeof ClientesClient>> = {}) {
  return render(
    <AppShellProvider routeKey="/s/s1/clientes">
      <ClientesClient
        storeId="s1"
        storeName="Vila Velha/ES"
        customers={customers}
        orders={orders}
        {...props}
      />
    </AppShellProvider>,
  );
}

describe("ClientesClient", () => {
  it("shows active customers by default (Todos), hides archived", () => {
    renderList();
    expect(screen.getAllByText("Maria Silva").length).toBeGreaterThan(0);
    expect(screen.getAllByText("João Souza").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ana Arquivada")).not.toBeInTheDocument();
  });

  it("filters by VIP segment", () => {
    renderList({ initialSegment: "vip" });
    expect(screen.getAllByText("Maria Silva").length).toBeGreaterThan(0);
    expect(screen.queryByText("João Souza")).not.toBeInTheDocument();
  });

  it("shows archived customers in the Arquivados segment", () => {
    renderList({ initialSegment: "arquivados" });
    expect(screen.getAllByText("Ana Arquivada").length).toBeGreaterThan(0);
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
  });

  it("shows only customers with unpaid orders in the A receber segment", () => {
    renderList({ initialSegment: "areceber" });
    expect(screen.getAllByText("João Souza").length).toBeGreaterThan(0);
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
  });

  it("searches across name and phone", async () => {
    const user = userEvent.setup();
    renderList();
    await user.type(
      screen.getByPlaceholderText("Buscar cliente, @ ou telefone…"),
      "90000",
    );
    expect(screen.getAllByText("João Souza").length).toBeGreaterThan(0);
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
  });

  it("renders the Aniversários segment as its own row layout with an Enviar mensagem action (design Mock Clientes 2a)", () => {
    const today = new Date();
    const carla = customer({
      id: "carla",
      name: "Carla Menezes",
      phone: "(27) 99812-4471",
      birthday: { day: today.getDate(), month: today.getMonth() + 1 },
      orderCount: 41,
    });
    renderList({ initialSegment: "aniversarios", customers: [carla] });
    expect(screen.getByText("Carla Menezes")).toBeInTheDocument();
    expect(screen.getByText(/41 pedidos/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Enviar mensagem" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/5527998124471"));
  });

  it("renders the Arquivados segment as a Cliente/Situação table with a working Reativar action (design Mock Clientes 2b)", async () => {
    const user = userEvent.setup();
    renderList({ initialSegment: "arquivados" });
    expect(screen.getByText("Situação")).toBeInTheDocument();
    expect(screen.getByText("Arquivado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reativar" }));
    expect(setCustomerArchivedAction).toHaveBeenCalledWith("s1", "ana", false);
    // Clicking Reativar must not also open the customer's detail sheet.
    expect(screen.queryByLabelText("Fechar")).not.toBeInTheDocument();
  });

  it("shows an 'Atraso' badge for an overdue customer's Tags column (design Mock Clientes 1a: Luiza Castro)", () => {
    const now = new Date();
    const staleDate = new Date(now.getTime() - 21 * 86_400_000).toISOString();
    const luiza = customer({
      id: "luiza",
      name: "Luiza Castro",
      orderCount: 15,
      lastOrderAt: staleDate,
      avgReorderDays: 7,
    });
    renderList({ customers: [luiza] });
    // Desktop table + mobile card both render in jsdom (the breakpoint split
    // is CSS-only), so the badge legitimately appears twice.
    expect(screen.getAllByText(/Atraso \d+d/).length).toBeGreaterThan(0);
  });

  it("shows a 'Novo' badge for a customer under 3 orders with no manual tags (design Mock Clientes 1a: João Pedro)", () => {
    const rookie = customer({ id: "rookie", name: "João Pedro", orderCount: 2 });
    renderList({ customers: [rookie] });
    expect(screen.getAllByText("Novo").length).toBeGreaterThan(0);
  });
});
