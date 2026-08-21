// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { PunchState } from "@/lib/cartelas";
import { CartelaPunchDots } from "./cartela-punch-dots";

function dots(states: PunchState[]) {
  const { container } = render(<CartelaPunchDots states={states} />);
  return Array.from(container.firstElementChild?.children ?? []) as HTMLElement[];
}

describe("CartelaPunchDots — forecast states", () => {
  it("renders 'usado-agora' as a solid primary dot with the selet-stamp animation class", () => {
    const [dot] = dots(["usado-agora"]);
    expect(dot.className).toContain("bg-primary");
    expect(dot.className).toContain("selet-stamp");
    // Carries a checkmark icon (an <svg>), unlike a plain unused "livre" dot.
    expect(dot.querySelector("svg")).not.toBeNull();
  });

  it("renders 'disponivel' as a hollow outlined dot with no icon", () => {
    const [dot] = dots(["disponivel"]);
    expect(dot.className).toContain("border-[#E2E9E2]");
    expect(dot.className).toContain("bg-[#F5F8F3]");
    expect(dot.querySelector("svg")).toBeNull();
  });

  it("gives each 'usado-agora' dot a distinct, increasing animation-delay by index", () => {
    const rendered = dots(["usado-agora", "usado-agora", "usado-agora"]);
    const delays = rendered.map((el) => el.style.animationDelay);
    expect(delays).toEqual(["0s", "0.25s", "0.5s"]);
  });

  it("existing punchStates()-driven states still render their prior styling unmodified", () => {
    const [livre, usado, brindeLivre, brindeUsado, ajuste] = dots([
      "livre",
      "usado",
      "brinde-livre",
      "brinde-usado",
      "ajuste",
    ]);
    expect(livre.className).toContain("bg-primary");
    expect(livre.querySelector("svg")).toBeNull();
    expect(usado.querySelector("svg")).not.toBeNull();
    expect(brindeLivre.className).toContain("bg-amber");
    expect(brindeUsado.className).toContain("text-amber");
    expect(ajuste.className).toContain("border-dashed");
  });

  it("a full forecast row mixes prior/usado-agora/disponivel in the given order", () => {
    const rendered = dots(["brinde-usado", "usado-agora", "disponivel"]);
    expect(rendered).toHaveLength(3);
    expect(rendered[0].querySelector("svg")).not.toBeNull(); // brinde-usado: checkmark
    expect(rendered[1].className).toContain("selet-stamp"); // usado-agora: pulsing
    expect(rendered[2].querySelector("svg")).toBeNull(); // disponivel: hollow, no icon
  });
});
