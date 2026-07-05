// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Customer } from "@/lib/types";
import { ClientesClient } from "./clientes-client";

vi.mock("@/actions/customers", () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
  setCustomerArchivedAction: vi.fn(),
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

const customers = [
  customer({ name: "Maria Silva", tags: ["vip"] }),
  customer({ name: "João Souza" }),
  customer({ name: "Ana Arquivada", archived: true }),
];

describe("ClientesClient", () => {
  it("shows active customers by default, hides archived", () => {
    render(<ClientesClient storeId="s1" customers={customers} />);
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("João Souza")).toBeInTheDocument();
    expect(screen.queryByText("Ana Arquivada")).not.toBeInTheDocument();
  });

  it("filters by VIP segment", async () => {
    const user = userEvent.setup();
    render(<ClientesClient storeId="s1" customers={customers} />);
    await user.click(screen.getByRole("button", { name: "VIP" }));
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.queryByText("João Souza")).not.toBeInTheDocument();
  });

  it("shows archived customers in the Arquivados segment", async () => {
    const user = userEvent.setup();
    render(<ClientesClient storeId="s1" customers={customers} />);
    await user.click(screen.getByRole("button", { name: "Arquivados" }));
    expect(screen.getByText("Ana Arquivada")).toBeInTheDocument();
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
  });

  it("filters by search query", async () => {
    const user = userEvent.setup();
    render(<ClientesClient storeId="s1" customers={customers} />);
    await user.type(screen.getByPlaceholderText("Buscar cliente…"), "joão");
    expect(screen.getByText("João Souza")).toBeInTheDocument();
    expect(screen.queryByText("Maria Silva")).not.toBeInTheDocument();
  });
});
