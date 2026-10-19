import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const req = (path: string, cookie = false) =>
  new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie: "__session=x" } : {},
  });

describe("proxy", () => {
  it.each(["/s/aniversario-3-anos", "/s/aniversario-3-anos/opengraph-image-1a2b3c"])(
    "lets logged-out visitors reach the public sorteio %s",
    (path) => {
      expect(proxy(req(path)).headers.get("location")).toBeNull();
    },
  );

  it.each(["/painel/vila-velha", "/painel/vila-velha/sorteios", "/s/vila-velha/pedidos", "/"])(
    "still sends logged-out visitors from %s to /login",
    (path) => {
      expect(proxy(req(path)).headers.get("location")).toContain("/login");
    },
  );

  it("lets logged-in users through", () => {
    expect(proxy(req("/painel/vila-velha", true)).headers.get("location")).toBeNull();
  });
});
