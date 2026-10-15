// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { RegistrarCompraDialog } from "./registrar-compra-dialog";
import { todayDateInput } from "../financeiro/finance-shared";

const applyMovementAction = vi.hoisted(() => vi.fn());
vi.mock("@/actions/stock", () => ({ applyMovementAction }));

const berry: StockItem = {
  id: "berry",
  name: "CR7 Drive Berry Mix",
  category: "bebidas",
  unit: "un",
  tracked: true,
  pkgLabel: "caixa",
  pkgSize: 12,
  sealed: 0,
  depSealed: 2,
  open: 0,
  qty: 0,
  continuousUse: false,
  consumptionMode: "medido",
  openPkg: false,
  usos: 0,
  resellable: true,
  sellPrice: 2600,
  cost: 14690,
  reorderAt: 1,
  lowStock: true,
  archived: false,
  updatedAt: "2026-01-01T12:00:00.000Z",
};

function renderDialog(preselectId: string | null = "berry", onOpenChange = vi.fn()) {
  render(
    <RegistrarCompraDialog
      storeId="s1"
      items={[berry]}
      open
      preselectId={preselectId}
      onOpenChange={onOpenChange}
      onCreateNew={() => {}}
    />,
  );
  return onOpenChange;
}

const qtyInput = () => screen.getByRole("textbox", { name: /caixas/i });
const totalInput = () => screen.getByRole("textbox", { name: /Custo total/ });

describe("RegistrarCompraDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMovementAction.mockResolvedValue({ ok: true });
  });

  it("starts with the item from the sheet, showing where its stock sits", () => {
    renderDialog();
    expect(screen.getByText("CR7 Drive Berry Mix")).toBeInTheDocument();
    expect(screen.getByText("caixa com 12 un · loja 0 caixas · depósito 2 caixas")).toBeInTheDocument();
  });

  it("stores in the depósito by default and says so on the button; Loja switches both", async () => {
    const user = userEvent.setup();
    renderDialog();
    const dest = screen.getByRole("group", { name: "Guardar em" });
    expect(within(dest).getByRole("button", { name: /Depósito/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lançar no depósito" })).toBeInTheDocument();

    await user.click(within(dest).getByRole("button", { name: /Loja/ }));
    expect(screen.getByRole("button", { name: "Lançar na loja" })).toBeInTheDocument();
  });

  it("derives cost per caixa, per unit and the resale margin", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(qtyInput(), "12");
    await user.type(totalInput(), "1762,80");

    expect(screen.getByText(/R\$ 146,90 por caixa/)).toBeInTheDocument();
    expect(screen.getByText("R$ 12,24 por un")).toBeInTheDocument();
    expect(screen.getByText(/margem de 53% no preço atual de R\$ 26,00/)).toBeInTheDocument();
  });

  it("books the entrada in the chosen place, per package, dated today", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    await user.type(qtyInput(), "12");
    await user.type(totalInput(), "1762,80");
    await user.click(screen.getByRole("button", { name: "Lançar no depósito" }));

    await waitFor(() =>
      expect(applyMovementAction).toHaveBeenCalledWith({
        storeId: "s1",
        itemId: "berry",
        type: "entrada",
        qty: 12,
        byPackage: true,
        price: 14690,
        reason: "ENTRADA",
        loc: "deposito",
        date: todayDateInput(),
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("sends the Loja when chosen", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(within(screen.getByRole("group", { name: "Guardar em" })).getByRole("button", { name: /Loja/ }));
    await user.type(qtyInput(), "1");
    await user.click(screen.getByRole("button", { name: "Lançar na loja" }));
    await waitFor(() => expect(applyMovementAction).toHaveBeenCalledWith(expect.objectContaining({ loc: "loja", qty: 1 })));
  });

  it("a back-dated purchase carries its date and warns that counted balances prevail", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(qtyInput(), "2");
    const date = screen.getByLabelText("Data da compra");
    expect(date).toHaveAttribute("max", todayDateInput());
    expect(screen.queryByText(/prevalecem/)).not.toBeInTheDocument();

    await user.clear(date);
    await user.type(date, "2026-10-02");
    expect(screen.getByText(/Saldos contados depois dela/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lançar no depósito" }));
    await waitFor(() => expect(applyMovementAction).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-02" })));
  });

  it("refuses fractional packages without calling the server", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(qtyInput(), "1,5");
    await user.click(screen.getByRole("button", { name: "Lançar no depósito" }));
    expect(applyMovementAction).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when the server refuses", async () => {
    applyMovementAction.mockResolvedValue({ ok: false, error: "A data não pode ser futura." });
    const user = userEvent.setup();
    const onOpenChange = renderDialog();
    await user.type(qtyInput(), "1");
    await user.click(screen.getByRole("button", { name: "Lançar no depósito" }));
    await waitFor(() => expect(applyMovementAction).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
