// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StockItem } from "@/lib/types";
import { AbrirEmbalagemDialog } from "./abrir-embalagem-dialog";

const openNextPackageAction = vi.hoisted(() => vi.fn());
vi.mock("@/actions/stock", () => ({ openNextPackageAction }));

const shake = (over: Partial<StockItem> = {}): StockItem => ({
  id: "shake",
  name: "Shake Herbalife Baunilha",
  category: "secos",
  unit: "g",
  tracked: true,
  pkgLabel: "pote",
  pkgSize: 550,
  sealed: 3,
  depSealed: 6,
  open: 0,
  qty: 1650,
  continuousUse: true,
  consumptionMode: "continuo",
  openPkg: false,
  usos: 0,
  lastUsos: 14,
  resellable: false,
  reorderAt: 2,
  lowStock: false,
  archived: false,
  updatedAt: "2026-01-01T12:00:00.000Z",
  ...over,
});

function renderDialog(item: StockItem | null, onOpenChange = vi.fn()) {
  render(
    <AbrirEmbalagemDialog
      storeId="s1"
      item={item}
      usedIn={[{ name: "Shake Oreo", qty: 30, unit: "g" }]}
      onOpenChange={onOpenChange}
    />,
  );
  return onOpenChange;
}

describe("AbrirEmbalagemDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openNextPackageAction.mockResolvedValue({ ok: true });
  });

  it("stays closed without an item", () => {
    renderDialog(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms the previous pote and how well it yielded against the forecast", () => {
    renderDialog(shake());
    const dialog = screen.getByRole("dialog", { name: "Abrir embalagem" });
    // 550 g ÷ 30 g = 18 usos previstos → 14 is 78%
    expect(within(dialog).getByText("Pote anterior encerrado")).toBeInTheDocument();
    expect(within(dialog).getByText(/Rendeu 14 usos/)).toBeInTheDocument();
    expect(within(dialog).getByText("78% do previsto")).toBeInTheDocument();
  });

  it("omits the yield line for an item that never closed a pote", () => {
    renderDialog(shake({ lastUsos: undefined }));
    expect(screen.queryByText("Pote anterior encerrado")).not.toBeInTheDocument();
  });

  it("opens from the loja by default", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderDialog(shake());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /Loja/ })).toBeChecked();
    expect(within(dialog).getByText("3 potes lacrados")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Abrir pote" }));
    await waitFor(() => expect(openNextPackageAction).toHaveBeenCalledWith("s1", "shake", "loja"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("can take the pote from the depósito, which transfers and opens", async () => {
    const user = userEvent.setup();
    renderDialog(shake());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("6 potes lacrados · transfere e abre")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: /Depósito/ }));
    await user.click(within(dialog).getByRole("button", { name: "Abrir pote" }));
    await waitFor(() => expect(openNextPackageAction).toHaveBeenCalledWith("s1", "shake", "deposito"));
  });

  it("starts on the depósito when the loja has none sealed, and disables the empty origin", () => {
    renderDialog(shake({ sealed: 0 }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /Depósito/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Loja/ })).toBeDisabled();
  });

  it("cannot open anything when both are empty", () => {
    renderDialog(shake({ sealed: 0, depSealed: 0 }));
    expect(screen.getByRole("button", { name: "Abrir pote" })).toBeDisabled();
  });

  it("keeps the dialog open when the action fails", async () => {
    openNextPackageAction.mockResolvedValue({ ok: false, error: "Já existe uma embalagem aberta." });
    const user = userEvent.setup();
    const onOpenChange = renderDialog(shake());
    await user.click(screen.getByRole("button", { name: "Abrir pote" }));
    await waitFor(() => expect(openNextPackageAction).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
