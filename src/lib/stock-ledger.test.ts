import { describe, expect, it } from "vitest";
import type { StockMovement } from "@/lib/types";
import { dayLabel, describeMovement, isEditableMovement, movementKind, timeLabel } from "./stock-ledger";

const ctx = {
  storeId: "vila-velha",
  pkg: (n: number) => (n === 1 ? "caixa" : "caixas"),
  unit: (n: number) => (n === 1 ? "un" : "un"),
  continuousUse: false,
};

function mov(over: Partial<StockMovement>): StockMovement {
  return {
    id: "m1",
    type: "entrada",
    qty: 1,
    byPackage: false,
    loc: "loja",
    by: "ana@selet.com",
    at: "2026-10-13T12:20:00.000Z", // 09:20 in the store zone
    ...over,
  };
}

describe("movementKind", () => {
  it("files each movement under its chip", () => {
    expect(movementKind(mov({ type: "transferencia" }))).toBe("transf");
    expect(movementKind(mov({ type: "abertura" }))).toBe("abertura");
    expect(movementKind(mov({ type: "saida", reason: "VENDA", refOrder: "o1" }))).toBe("consumo");
    expect(movementKind(mov({ type: "saida", reason: "CONSUMO", refItem: "Shake" }))).toBe("consumo");
    // a sale's reversal is an AJUSTE tied to the order: still consumo
    expect(movementKind(mov({ type: "entrada", reason: "AJUSTE", refOrder: "o1" }))).toBe("consumo");
    expect(movementKind(mov({ type: "entrada", reason: "ENTRADA" }))).toBe("compra");
    expect(movementKind(mov({ type: "saida", reason: "PERDA" }))).toBe("ajuste");
    expect(movementKind(mov({ type: "saida", reason: "AJUSTE" }))).toBe("ajuste");
  });
});

describe("dayLabel / timeLabel", () => {
  const now = new Date("2026-10-14T15:00:00.000Z"); // 12:00 on the 14th in the store zone
  it("says Hoje, Ontem and weekday + date", () => {
    expect(dayLabel("2026-10-14T09:00:00.000Z", now)).toBe("Hoje");
    expect(dayLabel("2026-10-13T12:00:00.000Z", now)).toBe("Ontem · 13/10");
    expect(dayLabel("2026-10-02T15:00:00.000Z", now)).toBe("Sex · 02/10");
  });
  it("counts the calendar day of the store, not UTC", () => {
    // 01:30Z on the 14th is still the 13th (22:30) in the store zone
    expect(dayLabel("2026-10-14T01:30:00.000Z", now)).toBe("Ontem · 13/10");
  });
  it("prints the clock in the store zone", () => {
    expect(timeLabel("2026-10-13T12:20:00.000Z")).toBe("09:20");
  });
});

describe("describeMovement", () => {
  it("consumo links to the order and shows the deduction", () => {
    const row = describeMovement(
      mov({ type: "saida", qty: 2, reason: "VENDA", refOrder: "abc123", refItem: "Pedido #ABC1" }),
      ctx,
    );
    expect(row).toMatchObject({
      kind: "consumo",
      title: "Consumo ·",
      link: { text: "Pedido #ABC1", href: "/s/vila-velha/pedidos?order=abc123" },
      delta: "−2 un",
      tone: "ink",
      editable: false,
    });
    expect(row.meta).toBe("09:20 · ana");
  });

  it("a reversal reads Estorno", () => {
    const row = describeMovement(
      mov({ type: "entrada", qty: 1, reason: "AJUSTE", refOrder: "abc123", refItem: "Estorno #ABC1" }),
      ctx,
    );
    expect(row).toMatchObject({ title: "Estorno ·", link: { text: "Pedido #ABC1" }, delta: "+1 un" });
  });

  it("compra shows the total paid (no link) and where it went", () => {
    const row = describeMovement(
      mov({ type: "entrada", qty: 2, byPackage: true, price: 14690, reason: "ENTRADA", loc: "deposito" }),
      ctx,
    );
    expect(row).toMatchObject({ kind: "compra", title: "Compra ·", delta: "+2 caixas", tone: "depot", editable: true });
    expect(row.link?.text).toMatch(/293,80/);
    expect(row.link?.href).toBeUndefined();
    expect(row.meta).toBe("2 caixas para o depósito · ana");
  });

  it("transferência carries its TR code and note", () => {
    const row = describeMovement(
      mov({ type: "transferencia", qty: 1, byPackage: true, trCode: "TR-0087", note: "reposição de terça" }),
      ctx,
    );
    expect(row).toMatchObject({ kind: "transf", link: { text: "TR-0087" }, delta: "+1 caixa", tone: "depot", editable: false });
    expect(row.meta).toBe("Depósito → Loja · reposição de terça · 09:20 · ana");
  });

  it("abertura removes one package and keeps the yield note", () => {
    const row = describeMovement(
      mov({ type: "abertura", qty: 1, byPackage: true, refItem: "Abriu embalagem", note: "Pote anterior rendeu 18 usos (100%)" }),
      ctx,
    );
    expect(row).toMatchObject({ kind: "abertura", title: "Abriu embalagem", delta: "−1 caixa" });
    expect(row.meta).toBe("Pote anterior rendeu 18 usos (100%) · 09:20 · ana");
  });

  it("ajuste splits the reason from the detail", () => {
    const row = describeMovement(
      mov({ type: "entrada", qty: 3, reason: "AJUSTE", refItem: "Contagem errada · 2 → 5 un" }),
      ctx,
    );
    expect(row).toMatchObject({ kind: "ajuste", title: "Ajuste · Contagem errada", delta: "+3 un", tone: "amber" });
    expect(row.meta).toBe("2 → 5 un · ana");
  });

  it("a closed package keeps its own title", () => {
    const row = describeMovement(
      mov({ type: "saida", qty: 1, byPackage: true, reason: "PERDA", refItem: "Embalagem esvaziada · 14 usos" }),
      ctx,
    );
    expect(row).toMatchObject({ title: "Embalagem esvaziada", delta: "−1 caixa" });
    expect(row.meta).toBe("14 usos · ana");
  });

  it("contínuo items count loose movements in uses", () => {
    const row = describeMovement(mov({ type: "saida", qty: 3, reason: "VENDA", refOrder: "o1" }), {
      ...ctx,
      continuousUse: true,
    });
    expect(row.delta).toBe("−3 usos");
  });
});

describe("isEditableMovement", () => {
  it("only plain manual entradas/saídas", () => {
    expect(isEditableMovement({ type: "entrada" })).toBe(true);
    expect(isEditableMovement({ type: "saida", refItem: "Perda" })).toBe(false);
    expect(isEditableMovement({ type: "entrada", refOrder: "o1" })).toBe(false);
    expect(isEditableMovement({ type: "transferencia" })).toBe(false);
  });
});
