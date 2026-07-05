import { describe, expect, it } from "vitest";
import { canAccessSection, canAccessStore } from "./access";
import type { SessionUser } from "./types";

function user(overrides: Partial<SessionUser>): SessionUser {
  return {
    email: "x@selet.com",
    uid: "u1",
    name: "X",
    role: "funcionario",
    storeIds: ["loja-a"],
    sections: ["pedidos", "clientes"],
    status: "ativo",
    ...overrides,
  };
}

describe("canAccessStore", () => {
  it("admin accesses any store", () => {
    expect(canAccessStore(user({ role: "admin", storeIds: [] }), "loja-z")).toBe(true);
  });

  it('storeIds "all" accesses any store', () => {
    expect(canAccessStore(user({ storeIds: "all" }), "loja-z")).toBe(true);
  });

  it("funcionario limited to assigned stores", () => {
    const u = user({});
    expect(canAccessStore(u, "loja-a")).toBe(true);
    expect(canAccessStore(u, "loja-b")).toBe(false);
  });
});

describe("canAccessSection", () => {
  it("admin accesses every section regardless of sections array", () => {
    const u = user({ role: "admin", sections: [] });
    expect(canAccessSection(u, "financeiro")).toBe(true);
    expect(canAccessSection(u, "equipe")).toBe(true);
  });

  it("funcionario limited to granted sections", () => {
    const u = user({});
    expect(canAccessSection(u, "pedidos")).toBe(true);
    expect(canAccessSection(u, "financeiro")).toBe(false);
    expect(canAccessSection(u, "equipe")).toBe(false);
  });
});
