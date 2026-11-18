// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Order, StoreReceipt } from "@/lib/types";
import { ReceiptDialog, parseAmountInput, type ReceiptContext } from "./receipt-dialog";

const renderReceiptPdf = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
vi.mock("@/lib/receipt-pdf", () => ({ renderReceiptPdf }));

const order = {
  id: "o1",
  code: "1048",
  customerId: "c1",
  customerName: "Mariana Lopes",
  total: 8800,
  status: "concluido",
  paid: true,
  payMethod: "pix",
  createdAt: "2026-11-16T18:47:00.000Z",
} as Order;

const settings: StoreReceipt = {
  recipient: "Priscilla de Oliveira Lima Teles",
  institution: "Nubank",
  pixKey: "27988119617",
  category: "ALIMENTAÇÃO",
};

function setup(receipt: Partial<ReceiptContext> = {}) {
  const onOpenChange = vi.fn();
  render(
    <ReceiptDialog
      storeId="vila-velha"
      order={order}
      receipt={{ storeName: "Vila Velha/ES", settings, canEditSettings: true, ...receipt }}
      open
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange };
}

describe("parseAmountInput", () => {
  it("parses pt-BR amounts and rejects empty or zero", () => {
    expect(parseAmountInput("88,00")).toBe(8800);
    expect(parseAmountInput("1.234,5")).toBe(123450);
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
  });
});

describe("ReceiptDialog", () => {
  it("prefills customer, total and sale date/time and shows the fixed data", () => {
    setup();
    expect(screen.getByLabelText("Cliente")).toHaveValue("Mariana Lopes");
    expect(screen.getByLabelText("Valor")).toHaveValue("88,00");
    expect(screen.getByLabelText("Data")).toHaveValue("2026-11-16");
    expect(screen.getByLabelText("Horário")).toHaveValue("15:47");
    expect(screen.getByText("Priscilla de Oliveira Lima Teles")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar em Configurações" })).toHaveAttribute(
      "href",
      "/painel/vila-velha/configuracoes/loja",
    );
  });

  it("renders the PDF with the edited values", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    const { onOpenChange } = setup();

    const amount = screen.getByLabelText("Valor");
    await user.clear(amount);
    await user.type(amount, "50,5");
    await user.clear(screen.getByLabelText("Cliente"));
    await user.type(screen.getByLabelText("Cliente"), "Hotel Praia");
    await user.click(screen.getByRole("button", { name: /Baixar PDF · R\$\s50,50/ }));

    expect(renderReceiptPdf).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "Hotel Praia", amount: 5050, date: "2026-11-16", time: "15:47", orderCode: "1048" }),
    );
    expect(click).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers to reset the amount to the order total", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("button", { name: "Usar total" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Valor"));
    await user.type(screen.getByLabelText("Valor"), "10");
    await user.click(screen.getByRole("button", { name: "Usar total" }));
    expect(screen.getByLabelText("Valor")).toHaveValue("88,00");
  });

  it("blocks the download when the store has no receipt data", () => {
    setup({ settings: { recipient: "Só o nome" }, canEditSettings: false });
    expect(screen.getByRole("alert")).toHaveTextContent("Faltam os dados do recibo");
    expect(screen.queryByRole("link", { name: "Abrir Configurações" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar PDF" })).toBeDisabled();
  });

  it("links admins to the settings when data is missing", () => {
    setup({ settings: undefined });
    expect(screen.getByRole("link", { name: /Abrir Configurações/ })).toBeInTheDocument();
  });
});
