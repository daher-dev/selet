// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderItem, PudimBase, PudimFlavor, PudimMixin } from "@/lib/types";
import { PudimBuilder, type PudimBrindeOption } from "./pudim-builder";

function flavor(overrides: Partial<PudimFlavor> & { id: string }): PudimFlavor {
  return { name: overrides.id, price: 3200, recipe: [], archived: false, createdAt: "", ...overrides };
}
function base(overrides: Partial<PudimBase> & { id: string }): PudimBase {
  return {
    name: overrides.id,
    insumo: { name: "Insumo", qty: 1, unit: "un" },
    price: 0,
    archived: false,
    createdAt: "",
    ...overrides,
  };
}
function mixin(overrides: Partial<PudimMixin> & { id: string }): PudimMixin {
  return {
    name: overrides.id,
    insumo: { name: "Insumo", qty: 1, unit: "un" },
    tiers: [{ qty: 1, price: 500 }],
    archived: false,
    createdAt: "",
    ...overrides,
  };
}

const frutasAmarelas = flavor({ id: "sabor-1", name: "Frutas Amarelas", price: 3200 });
const ovomaltine = flavor({ id: "sabor-2", name: "Ovomaltine", price: 3400 });
const leite = base({ id: "base-1", name: "Leite", price: 0 });
const ambos = base({ id: "base-2", name: "Leite + NutreV", price: 200 });
const fibraAtiva = mixin({ id: "mix-1", name: "Fibra Ativa", tiers: [{ qty: 1, price: 500 }] });

function renderBuilder(
  props: Partial<React.ComponentProps<typeof PudimBuilder>> = {},
  onConfirm = vi.fn<(item: OrderItem) => void>(),
) {
  render(
    <PudimBuilder
      flavors={[frutasAmarelas, ovomaltine]}
      bases={[leite, ambos]}
      mixins={[fibraAtiva]}
      utensils={[]}
      brindes={[]}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return onConfirm;
}

function subtotal(): string | null {
  const text = screen.getByText("Subtotal").parentElement?.querySelector(".text-primary")
    ?.textContent ?? null;
  // Intl.NumberFormat inserts a non-breaking space between "R$" and the number.
  return text?.replace(/ /g, " ") ?? null;
}

describe("PudimBuilder", () => {
  it("labels the sabor section 'escolha 1' (single-select, unlike Shake's 'até 3')", () => {
    renderBuilder();
    expect(screen.getByText("escolha 1")).toBeInTheDocument();
  });

  it("disables Adicionar until a sabor is picked", async () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  });

  it("picking a second sabor REPLACES the first (single-select), not adds to it", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByText("Frutas Amarelas"));
    expect(subtotal()).toBe("R$ 32,00");
    await user.click(screen.getByText("Ovomaltine"));
    // Subtotal reflects only the most-recently-picked flavor's price, not both.
    expect(subtotal()).toBe("R$ 34,00");
  });

  it("unitPrice sums flavor + base surcharge + mixin tier price", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByText("Frutas Amarelas")); // 3200
    await user.click(screen.getByText("Leite + NutreV")); // +200
    await user.click(screen.getByText("Fibra Ativa")); // +500
    expect(subtotal()).toBe("R$ 39,00");
  });

  it("confirm() builds an OrderItem.pudim with the exact picks, omitting unset optional keys", async () => {
    const user = userEvent.setup();
    const onConfirm = renderBuilder();
    await user.click(screen.getByText("Frutas Amarelas"));
    await user.click(screen.getByText("Leite"));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const item = onConfirm.mock.calls[0][0] as OrderItem;
    expect(item.productId).toBe("sabor-1");
    expect(item.unitPrice).toBe(3200);
    expect(item.pudim).toEqual({
      flavorId: "sabor-1",
      baseId: "base-1",
      mixins: [],
    });
    // utensilOverrides/brinde must be entirely absent (not null/[]) when unset.
    expect(item.pudim).not.toHaveProperty("utensilOverrides");
    expect(item.pudim).not.toHaveProperty("brinde");
  });

  it("confirm() includes selected mixins with their chosen tier qty", async () => {
    const user = userEvent.setup();
    const onConfirm = renderBuilder();
    await user.click(screen.getByText("Frutas Amarelas"));
    await user.click(screen.getByText("Fibra Ativa"));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    const item = onConfirm.mock.calls[0][0] as OrderItem;
    expect(item.pudim?.mixins).toEqual([{ modifierId: "mix-1", qty: 1 }]);
  });

  it("renders a 'Montar pudim' brinde option and includes it, addon-free, in confirm()", async () => {
    const user = userEvent.setup();
    const brinde: PudimBrindeOption = {
      productId: "cha-limao",
      name: "Chá Limão",
      price: 1200,
      category: "bebidas",
      adicionais: [],
    };
    const onConfirm = renderBuilder({ brindes: [brinde] });
    await user.click(screen.getByText("Frutas Amarelas"));
    await user.click(screen.getByText("Chá Limão"));
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    const item = onConfirm.mock.calls[0][0] as OrderItem;
    expect(item.pudim?.brinde).toEqual({
      productId: "cha-limao",
      name: "Chá Limão",
      listPrice: 1200,
    });
    // The brinde's own price is never charged.
    expect(item.unitPrice).toBe(3200);
  });
});
