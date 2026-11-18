import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream } from "pdf-lib";
import {
  canIssueReceipt,
  formatReceiptDate,
  receiptConfigured,
  receiptDefaults,
  receiptFileName,
  receiptRows,
  toWinAnsi,
  type ReceiptData,
} from "./receipt";
import { renderReceiptPdf } from "./receipt-pdf";
import type { Order } from "./types";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    code: "1048",
    customerId: "c1",
    customerName: "Mariana Lopes",
    channel: "instagram",
    items: [],
    total: 8800,
    status: "concluido",
    paid: true,
    payMethod: "pix",
    stockConsumed: [],
    cartelaConsumed: [],
    cartelaSold: [],
    // 18:47 UTC = 15:47 in the store time zone (BRT, UTC-3).
    createdAt: "2026-11-16T18:47:00.000Z",
    updatedAt: "2026-11-16T18:47:00.000Z",
    ...overrides,
  } as Order;
}

const settings = {
  recipient: "Priscilla de Oliveira Lima Teles",
  institution: "Nubank",
  pixKey: "27988119617",
  wallet: "Alimentação/despesas hotel",
  category: "ALIMENTAÇÃO",
};

function data(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    storeName: "Vila Velha/ES",
    orderCode: "1048",
    settings,
    customer: "Mariana Lopes",
    amount: 8800,
    date: "2026-11-16",
    time: "15:47",
    generatedAt: new Date("2026-11-17T13:12:00.000Z"),
    ...overrides,
  };
}

/** Decodes the text drawn on every page (pdf-lib writes hex strings in Flate streams). */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents && "asArray" in contents ? contents.asArray() : [contents];
    for (const ref of streams) {
      const stream = doc.context.lookup(ref as never);
      if (!(stream instanceof PDFRawStream)) continue;
      const raw = Buffer.from(inflateSync(stream.contents)).toString("latin1");
      for (const m of raw.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
        out += Buffer.from(m[1], "hex").toString("latin1") + "\n";
      }
    }
  }
  return out;
}

describe("canIssueReceipt", () => {
  it("accepts a saved order paid via Pix", () => {
    expect(canIssueReceipt(order())).toBe(true);
  });

  it.each([
    ["new order", null],
    ["unpaid", order({ paid: false, payMethod: null })],
    ["card", order({ payMethod: "cartao" })],
    ["cash", order({ payMethod: "dinheiro" })],
    ["cancelled", order({ status: "cancelado" })],
    ["zero total", order({ total: 0 })],
  ])("rejects %s", (_label, o) => {
    expect(canIssueReceipt(o)).toBe(false);
  });
});

describe("receiptConfigured", () => {
  it("needs recipient, institution and Pix key", () => {
    expect(receiptConfigured(undefined)).toBe(false);
    expect(receiptConfigured({ recipient: "A", institution: "B" })).toBe(false);
    expect(receiptConfigured({ recipient: "A", institution: "B", pixKey: "  " })).toBe(false);
    expect(receiptConfigured({ recipient: "A", institution: "B", pixKey: "C" })).toBe(true);
  });
});

describe("receiptDefaults", () => {
  it("suggests the customer, total and sale date/time in store time", () => {
    expect(receiptDefaults(order())).toEqual({
      customer: "Mariana Lopes",
      amount: 8800,
      date: "2026-11-16",
      time: "15:47",
    });
  });
});

describe("receiptRows", () => {
  it("prints the rows in order with the formatted date", () => {
    expect(receiptRows(data())).toEqual([
      ["Para", "Priscilla de Oliveira Lima Teles"],
      ["Instituição", "Nubank"],
      ["Chave Pix", "27988119617"],
      ["Cliente", "Mariana Lopes"],
      ["Data", "16/11/2026, 15:47"],
      ["Carteira", "Alimentação/despesas hotel"],
      ["Categoria", "ALIMENTAÇÃO"],
    ]);
  });

  it("leaves out empty optional lines", () => {
    const rows = receiptRows(data({ customer: " ", settings: { ...settings, wallet: "", category: undefined } }));
    expect(rows.map(([label]) => label)).toEqual(["Para", "Instituição", "Chave Pix", "Data"]);
  });
});

describe("helpers", () => {
  it("formats the date and file name", () => {
    expect(formatReceiptDate("2026-11-16", "15:47")).toBe("16/11/2026, 15:47");
    expect(receiptFileName("1048")).toBe("recibo-1048.pdf");
  });

  it("keeps accents and drops what standard fonts can't draw", () => {
    expect(toWinAnsi("ALIMENTAÇÃO — café ☕ 🍰")).toBe("ALIMENTAÇÃO — café");
    expect(toWinAnsi("R$ 88,00")).toBe("R$ 88,00");
  });
});

describe("renderReceiptPdf", () => {
  it("renders every line, the amount and the footer", async () => {
    const bytes = await renderReceiptPdf(data({ amount: 12345 }));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const text = await pdfText(bytes);
    for (const s of [
      "Recibo",
      "Pagamento via Pix",
      "Pedido #1048",
      "R$ 123,45",
      "Priscilla de Oliveira Lima Teles",
      "Nubank",
      "27988119617",
      "Mariana Lopes",
      "16/11/2026, 15:47",
      "Alimentação/despesas hotel",
      "ALIMENTAÇÃO",
      "Gerado em 17/11/2026 às 10:12 · Selet Vila Velha/ES",
    ]) {
      expect(text).toContain(s);
    }
  });

  it("wraps long values and survives characters outside the font", async () => {
    const long = "Nome muito comprido de titular de conta que não cabe numa linha só do recibo 🙂";
    const text = await pdfText(await renderReceiptPdf(data({ customer: long })));
    expect(text).toContain("Nome muito comprido");
    expect(text).toContain("recibo");
    expect(text).not.toContain(long);
  });
});
