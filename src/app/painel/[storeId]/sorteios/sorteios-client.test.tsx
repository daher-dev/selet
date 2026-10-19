// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { publishRaffleAction } from "@/actions/raffles";
import type { RaffleSummary } from "@/data/raffles";
import { raffle } from "./fixtures";
import { SorteiosClient } from "./sorteios-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/painel/s1/sorteios",
}));
vi.mock("@/actions/raffles", () => ({
  publishRaffleAction: vi.fn(async () => ({ ok: true })),
  saveRaffleAction: vi.fn(async () => ({ ok: true, id: "x" })),
}));

const summary = (over: Partial<RaffleSummary>): RaffleSummary => ({
  ...raffle(),
  entryCount: 48,
  numberCount: 52,
  pendingCount: 9,
  ...over,
});

function renderList(raffles: RaffleSummary[]) {
  return render(
    <AppShellProvider routeKey="/painel/s1/sorteios">
      <SorteiosClient
        storeId="s1"
        raffles={raffles}
        leadCounts={{ total: 112, novos: 74 }}
        origin="https://selet.app"
      />
    </AppShellProvider>,
  );
}

describe("SorteiosClient", () => {
  it("shows the three card states with the public link and what is left to check", () => {
    renderList([
      summary({}),
      summary({ id: "r2", name: "Black Friday Selet", status: "rascunho", slug: "black-friday", numberTo: 100, entryCount: 0, numberCount: 0, pendingCount: 0 }),
      summary({ id: "r3", name: "Dia das Crianças", status: "sorteado", slug: "dia-das-criancas", winner: { number: 37, entryId: "r3_x", name: "Beatriz Almeida" }, entryCount: 64 }),
    ]);

    expect(screen.getAllByText("Aniversário Selet 3 anos").length).toBeGreaterThan(0);
    expect(screen.getByText("selet.app/s/aniversario-3-anos")).toBeInTheDocument();
    expect(screen.getByText(/9 participantes aguardando conferência das regras/)).toBeInTheDocument();
    expect(screen.getByText("O link é gerado ao publicar")).toBeInTheDocument();
    expect(screen.getAllByText("Beatriz Almeida").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Ver 64 leads" })).toHaveAttribute(
      "href",
      "/painel/s1/sorteios/leads?sorteio=r3",
    );
    expect(screen.getByText("74 novos")).toBeInTheDocument();
  });

  it("asks before publishing a draft and publishes it", async () => {
    renderList([summary({ id: "r2", name: "Black Friday Selet", status: "rascunho", slug: "black-friday", entryCount: 0, numberCount: 0, pendingCount: 0 })]);
    await userEvent.click(screen.getAllByRole("button", { name: "Publicar" })[0]);

    expect(screen.getByText('Publicar "Black Friday Selet"?')).toBeInTheDocument();
    expect(publishRaffleAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole("button", { name: "Publicar" }).at(-1)!);
    await waitFor(() => expect(publishRaffleAction).toHaveBeenCalledWith("s1", "r2"));
  });

  it("explains the first step when there are no raffles", () => {
    renderList([]);
    expect(screen.getByText("Nenhum sorteio ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar primeiro sorteio" })).toBeInTheDocument();
  });
});
