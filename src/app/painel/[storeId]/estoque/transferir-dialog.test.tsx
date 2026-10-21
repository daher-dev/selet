// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { TransferirDialog } from "./transferir-dialog";

const transferToStoreAction = vi.hoisted(() => vi.fn());
vi.mock("@/actions/stock", () => ({ transferToStoreAction }));

function stockItem(over: Partial<StockItem>): StockItem {
  return {
    id: "x",
    name: "Item",
    category: "bebidas",
    unit: "un",
    tracked: true,
    pkgLabel: "caixa",
    pkgSize: 12,
    sealed: 5,
    depSealed: 0,
    open: 0,
    qty: 60,
    continuousUse: false,
    consumptionMode: "medido",
    openPkg: false,
    usos: 0,
    resellable: false,
    reorderAt: 1,
    lowStock: false,
    archived: false,
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...over,
  };
}

// out in the Loja against a minimum of 2 caixas, 2 caixas in the depósito
const berry = stockItem({ id: "berry", name: "CR7 Drive Berry Mix", sealed: 0, qty: 0, depSealed: 2, reorderAt: 2 });
// 1 pote + 1 in use (= 2) against a minimum of 3, 4 potes in the depósito
const fiber = stockItem({
  id: "fiber",
  name: "Fiber Concentrate",
  unit: "g",
  pkgLabel: "pote",
  pkgSize: 200,
  sealed: 1,
  qty: 200,
  continuousUse: true,
  consumptionMode: "continuo",
  openPkg: true,
  reorderAt: 3,
  depSealed: 4,
});
// fine in the Loja, 2 caixas in the depósito
const beauty = stockItem({ id: "beauty", name: "Beauty Drink", depSealed: 2 });
// nothing in the depósito: never offered
const empty = stockItem({ id: "empty", name: "Sem depósito", depSealed: 0 });

function renderDialog(preselectId: string | null = null, onOpenChange = vi.fn()) {
  render(
    <TransferirDialog
      storeId="s1"
      storeName="Vila Velha/ES"
      items={[berry, fiber, beauty, empty]}
      open
      preselectId={preselectId}
      onOpenChange={onOpenChange}
    />,
  );
  return screen.getByRole("dialog", { name: "Transferir para a loja" });
}

describe("TransferirDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transferToStoreAction.mockResolvedValue({ ok: true, trCode: "TR-0088" });
  });

  it("names the store and the direction", () => {
    const dialog = renderDialog();
    expect(within(dialog).getByText("Vila Velha/ES")).toBeInTheDocument();
    expect(within(dialog).getByText("Depósito")).toBeInTheDocument();
    expect(within(dialog).getByText("Loja")).toBeInTheDocument();
  });

  it("suggests the items below their minimum that the depósito can cover, and blocks until each is decided", () => {
    const dialog = renderDialog();
    expect(within(dialog).getByText(/Sugestões · abaixo do mínimo na loja/)).toBeInTheDocument();
    expect(within(dialog).getByText("CR7 Drive Berry Mix")).toBeInTheDocument();
    expect(within(dialog).getByText("Fiber Concentrate")).toBeInTheDocument();
    // fine in the loja / empty depósito → not suggested
    expect(within(dialog).queryByText("Beauty Drink")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Sem depósito")).not.toBeInTheDocument();
    // how many packages it takes to reach the minimum: 2 caixas (0 of 24 un) and 1 pote (2 of 3)
    expect(within(dialog).getByText("2 caixas")).toBeInTheDocument();
    expect(within(dialog).getByText("1 pote")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Revise 2 sugestões" })).toBeDisabled();
  });

  it("including and discarding suggestions unlocks the transfer, with antes → depois on both sides", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();

    const cards = within(dialog).getAllByRole("button", { name: "Incluir na transferência" });
    await user.click(cards[0]); // CR7
    expect(within(dialog).getByText("Depósito 2 → 0 caixas")).toBeInTheDocument();
    expect(within(dialog).getByText("Loja 0 → 24 un")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Revise 1 sugestão" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Descartar" }));
    expect(within(dialog).queryByText(/Sugestões/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Transferir 1 item" })).toBeEnabled();
  });

  it("steps the quantity between 1 and what the depósito holds", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog("berry");

    expect(within(dialog).getByRole("button", { name: "Mais caixas" })).toBeDisabled(); // 2 of 2
    await user.click(within(dialog).getByRole("button", { name: "Menos caixas" }));
    expect(within(dialog).getByText("Depósito 2 → 1 caixa")).toBeInTheDocument();
    expect(within(dialog).getByText("Loja 0 → 12 un")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Menos caixa" })).toBeDisabled();
  });

  it("sends the lines and the note, then closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const dialog = renderDialog("berry", onOpenChange);
    await user.click(within(dialog).getByRole("button", { name: "Menos caixas" }));
    await user.type(within(dialog).getByPlaceholderText("Ex: reposição de terça"), "reposição de terça");

    // Fiber is still a pending suggestion: decide it first
    await user.click(within(dialog).getByRole("button", { name: "Descartar" }));
    await user.click(within(dialog).getByRole("button", { name: "Transferir 1 item" }));

    await waitFor(() =>
      expect(transferToStoreAction).toHaveBeenCalledWith({
        storeId: "s1",
        lines: [{ itemId: "berry", qty: 1 }],
        note: "reposição de terça",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("adds any other item the depósito holds", async () => {
    const user = userEvent.setup();
    const dialog = renderDialog("berry");
    await user.click(within(dialog).getByRole("button", { name: "Descartar" })); // fiber suggestion
    await user.click(within(dialog).getByRole("button", { name: /Adicionar item do depósito/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Beauty Drink/ }));

    expect(within(dialog).getByText("Depósito 2 → 1 caixa")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Transferir 2 itens" })).toBeEnabled();
  });

  it("keeps the sheet open and the lines when the server refuses", async () => {
    transferToStoreAction.mockResolvedValue({ ok: false, error: "Depósito sem embalagens suficientes de CR7." });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const dialog = renderDialog("berry", onOpenChange);
    await user.click(within(dialog).getByRole("button", { name: "Descartar" }));
    await user.click(within(dialog).getByRole("button", { name: "Transferir 1 item" }));

    await waitFor(() => expect(transferToStoreAction).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(within(dialog).getByText("Depósito 2 → 0 caixas")).toBeInTheDocument();
  });

  it("tells you to pick an item when there is nothing to suggest", () => {
    render(
      <TransferirDialog storeId="s1" storeName="V" items={[beauty]} open preselectId={null} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Escolha um item" })).toBeDisabled();
  });
});
