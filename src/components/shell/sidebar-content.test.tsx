// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SessionUser, Store } from "@/lib/types";
import { SidebarContent } from "./sidebar-content";

vi.mock("next/navigation", () => ({
  usePathname: () => "/s/s1",
  useRouter: () => ({ push: vi.fn() }),
}));

const store: Store = { id: "s1", name: "Vila Velha/ES", sub: "Matriz", initial: "V" };

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    email: "ana@selet.com",
    uid: "u1",
    name: "Ana Costa",
    role: "funcionario",
    storeIds: [store.id],
    sections: [],
    status: "ativo",
    ...overrides,
  };
}

function renderSidebar(sessionUser: SessionUser) {
  return render(
    <SidebarContent
      user={sessionUser}
      store={store}
      stores={[store]}
      badges={{ openOrders: 0, cartelasAtivas: 0, lowStock: 0 }}
    />,
  );
}

describe("SidebarContent — Pudim nav item", () => {
  it("is hidden for a funcionário without the 'pudim' section granted", () => {
    renderSidebar(user({ sections: ["pedidos", "shakes"] }));
    expect(screen.queryByText("Pudim")).not.toBeInTheDocument();
  });

  it("appears once the funcionário is granted 'pudim' — same rule as Shakes", () => {
    renderSidebar(user({ sections: ["pedidos", "shakes", "pudim"] }));
    expect(screen.getByText("Pudim")).toBeInTheDocument();
    expect(screen.getByText("Shakes")).toBeInTheDocument();
  });

  it("is visible to any admin regardless of granted sections", () => {
    renderSidebar(user({ role: "admin", sections: [] }));
    expect(screen.getByText("Pudim")).toBeInTheDocument();
  });

  it("is positioned between Shakes and Cartelas", () => {
    renderSidebar(user({ role: "admin", sections: [] }));
    const labels = screen
      .getAllByRole("link")
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t);
    const shakesIdx = labels.findIndex((t) => t.startsWith("Shakes"));
    const pudimIdx = labels.findIndex((t) => t.startsWith("Pudim"));
    const cartelasIdx = labels.findIndex((t) => t.startsWith("Cartelas"));
    expect(shakesIdx).toBeLessThan(pudimIdx);
    expect(pudimIdx).toBeLessThan(cartelasIdx);
  });
});
