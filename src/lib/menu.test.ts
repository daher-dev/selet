import { describe, expect, it } from "vitest";
import { defaultMenu, describeMix, extrasRows, priceMix, resolveMenu, type MenuCatalog, type MenuDoc, type MenuEntry } from "./menu";

const product = (id: string, price: number, available = true) => ({ id, name: id.toUpperCase(), description: `desc ${id}`, price, group: "Lanches", available });

const catalog: MenuCatalog = {
  products: [product("a", 1000), product("b", 1000), product("c", 1000), product("d", 2000), product("gone", 500, false)],
  shake: {
    flavors: [
      { id: "morango", name: "Morango", price: 2600, archived: false },
      { id: "cafe", name: "Café", price: 2900, archived: false },
      { id: "velho", name: "Velho", price: 2000, archived: true },
    ],
    bases: [{ id: "vegetal", name: "Leite vegetal", price: 300, archived: false }],
    rims: [{ id: "borda", name: "Morango", tiers: [{ qty: 1, price: 400 }, { qty: 2, price: 600 }], archived: false }],
    mixins: [{ id: "fibra", name: "Fibra de uva", tiers: [{ qty: 1, price: 700 }], archived: false }],
  },
  pudim: { flavors: [], bases: [], rims: [], mixins: [] },
};

const doc = (entries: MenuEntry[][]): MenuDoc => ({
  title: "Cardápio",
  tagline: "",
  sections: entries.map((e, i) => ({ id: `s${i}`, title: `S${i}`, entries: e })),
});
const p = (id: string): MenuEntry => ({ source: "product", id });
const mix = (over: Partial<NonNullable<MenuEntry["mix"]>> = {}): MenuEntry => ({
  source: "shake-mix",
  id: "m1",
  name: "Frutas Vermelhas",
  mix: { flavorIds: ["morango", "cafe"], baseId: "vegetal", rims: [{ id: "borda", qty: 2 }], mixins: [{ id: "fibra", qty: 1 }], ...over },
});

describe("priceMix", () => {
  it("charges the priciest sabor plus base, borda tier and adicionais, like a Pedidos line", () => {
    const r = priceMix(mix().mix!, catalog.shake);
    expect(r.price).toBe(2900 + 300 + 600 + 700);
    expect(r.available).toBe(true);
    expect(r.lines.map((l) => l.label)).toEqual(["Sabor Café (o mais caro)", "Leite vegetal", "Borda Morango 2×", "Fibra de uva"]);
  });

  it("is unavailable when a pick is archived or gone, or there is no sabor", () => {
    expect(priceMix(mix({ flavorIds: ["velho"] }).mix!, catalog.shake).available).toBe(false);
    expect(priceMix(mix({ mixins: [{ id: "sumiu", qty: 1 }] }).mix!, catalog.shake).available).toBe(false);
    expect(priceMix(mix({ flavorIds: [] }).mix!, catalog.shake).available).toBe(false);
  });

  it("suggests a description from the picks", () => {
    expect(describeMix(mix().mix!, catalog.shake)).toBe("Morango e Café com borda de morango e fibra de uva.");
  });
});

describe("resolveMenu", () => {
  it("takes live prices and catalog texts, numbering items across sections", () => {
    const [s0, s1] = resolveMenu(doc([[p("a"), mix()], [{ source: "extras-shake", id: "shake" }, p("b")]]), catalog);
    expect(s0.entries.map((e) => [e.number, e.name, e.price])).toEqual([
      [1, "A", 1000],
      [2, "Frutas Vermelhas", 4500],
    ]);
    expect(s1.entries.map((e) => [e.kind, e.number])).toEqual([
      ["table", 0],
      ["item", 3],
    ]);
    expect(s0.entries[1].description).toBe("Morango e Café com borda de morango e fibra de uva.");
  });

  it("drops unavailable entries for customers but keeps them faded for the editor", () => {
    const d = doc([[p("gone"), p("a"), p("missing"), mix({ flavorIds: ["velho"] })]]);
    expect(resolveMenu(d, catalog)[0].entries.map((e) => e.key)).toEqual(["product:a"]);
    const kept = resolveMenu(d, catalog, { keepUnavailable: true })[0].entries;
    expect(kept.map((e) => [e.available, e.number])).toEqual([[false, 0], [true, 1], [false, 0], [false, 0]]);
  });

  it("uses overrides, and an empty override falls back to the catalog", () => {
    const d = doc([[{ ...p("a"), name: "Pão de queijo", description: "" }]]);
    expect(resolveMenu(d, catalog)[0].entries[0]).toMatchObject({ name: "Pão de queijo", description: "" });
    d.sections[0].entries[0].name = "  ";
    expect(resolveMenu(d, catalog)[0].entries[0].name).toBe("A");
  });

  it("shows a single price only when 3+ visible items cost the same", () => {
    expect(resolveMenu(doc([[p("a"), p("b"), p("c"), p("gone")]]), catalog)[0].uniformPrice).toBe(1000);
    expect(resolveMenu(doc([[p("a"), p("b")]]), catalog)[0].uniformPrice).toBeNull();
    expect(resolveMenu(doc([[p("a"), p("b"), p("d")]]), catalog)[0].uniformPrice).toBeNull();
  });
});

describe("extras", () => {
  it("lists one row per tier, adicionais first", () => {
    expect(extrasRows(catalog.shake)).toEqual([
      { label: "Fibra de uva", price: 700 },
      { label: "Borda Morango · 1×", price: 400 },
      { label: "Borda Morango · 2×", price: 600 },
    ]);
  });
});

describe("defaultMenu", () => {
  it("makes one section per category with available products, then the extras tables", () => {
    const m = defaultMenu(catalog);
    expect(m.sections.map((s) => [s.title, s.entries.map((e) => e.id)])).toEqual([
      ["Lanches", ["a", "b", "c", "d"]],
      ["Extras para o seu shake", ["shake"]],
    ]);
  });
});
