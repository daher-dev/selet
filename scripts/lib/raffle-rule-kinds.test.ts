import { describe, expect, it } from "vitest";
import { migrateRule } from "./raffle-rule-kinds";

const rule = (text: string) => ({ id: "r", text, type: "obr" as const });

describe("migrateRule", () => {
  it("types 'Seguir @perfil' with a link and keeps the text", () => {
    expect(migrateRule(rule("Seguir @selet.vv no Instagram."))).toEqual({
      change: "follow",
      rule: { id: "r", type: "obr", kind: "follow", link: "https://instagram.com/selet.vv", text: "Seguir @selet.vv no Instagram." },
    });
    expect(migrateRule(rule("Seguir @selet.vv."))).toMatchObject({ rule: { link: "https://instagram.com/selet.vv" } });
  });
  it("flags curtir/comentar for manual post links", () => {
    expect(migrateRule(rule("Curtir o post do sorteio"))).toEqual({ change: "needs-post" });
    expect(migrateRule(rule("Comentar marcando 2 amigos"))).toEqual({ change: "needs-post" });
  });
  it("leaves generic and already-typed rules alone", () => {
    expect(migrateRule(rule("Convidar alguém para o grupo VIP"))).toEqual({ change: "none" });
    expect(migrateRule(rule("Seguir a loja"))).toEqual({ change: "none" });
    expect(migrateRule({ ...rule("Seguir @a"), kind: "custom" })).toEqual({ change: "none" });
  });
});
