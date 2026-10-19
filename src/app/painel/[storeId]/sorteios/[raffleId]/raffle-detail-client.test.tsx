// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShellProvider } from "@/components/shell/app-shell-context";
import { setRuleCheckAction } from "@/actions/raffles";
import { entry, raffle } from "../fixtures";
import { RaffleDetailClient } from "./raffle-detail-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/painel/s1/sorteios/r1",
}));
vi.mock("@/actions/raffles", () => ({
  setRuleCheckAction: vi.fn(async () => ({ ok: true })),
  setSignupsOpenAction: vi.fn(async () => ({ ok: true })),
  saveRaffleAction: vi.fn(async () => ({ ok: true, id: "r1" })),
  publishRaffleAction: vi.fn(async () => ({ ok: true })),
  removeNumberAction: vi.fn(async () => ({ ok: true })),
  excludeEntryAction: vi.fn(async () => ({ ok: true })),
  linkLeadAction: vi.fn(async () => ({ ok: true })),
  convertLeadAction: vi.fn(async () => ({ ok: true })),
  grantExtraAction: vi.fn(async () => ({ ok: true })),
  waiveRuleAction: vi.fn(async () => ({ ok: true })),
  pickForEntryAction: vi.fn(async () => ({ ok: true })),
  confirmWinnerAction: vi.fn(async () => ({ ok: true })),
  announceResultAction: vi.fn(async () => ({ ok: true, sent: 0, failed: 0 })),
}));

const juliana = entry({ checks: { seg: true } });
const thiago = entry({
  id: "r1_27999990002",
  name: "Thiago Ramos",
  phone: "27999990002",
  status: "ok",
  checks: { seg: true, cur: true, gru: true },
  numbers: [
    { n: 150, kind: "cadastro", at: "2026-10-18T14:32:00-03:00" },
    { n: 77, kind: "extra", reason: "Trouxe amigas", by: "Ana Costa", at: "2026-10-19T09:00:00-03:00" },
  ],
  slots: [{ kind: "bonus", ruleId: "gru", at: "2026-10-19T09:00:00-03:00" }],
});
const lucas = entry({ id: "r1_27999990003", name: "Lucas M.", phone: "27999990003", status: "excl", exclReason: "Perfil duplicado", numbers: [] });

function renderDetail() {
  return render(
    <AppShellProvider routeKey="/painel/s1/sorteios/r1">
      <RaffleDetailClient
        storeId="s1"
        raffle={raffle()}
        entries={[juliana, thiago, lucas]}
        customers={[]}
        origin="https://selet.app"
        userName="Ana Costa"
      />
    </AppShellProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RaffleDetailClient", () => {
  it("turns each configured rule into a column and counts people by situation", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: "Seguir @selet.vv: Juliana Prado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Curtir o post: Juliana Prado" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Convidar para o grupo: Thiago Ramos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todos · 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A conferir · 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validados · 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluídos · 1" })).toBeInTheDocument();
  });

  it("checks a rule by hand through the server action", async () => {
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Curtir o post: Juliana Prado" }));
    expect(setRuleCheckAction).toHaveBeenCalledWith("s1", "r1_27999990001", "cur", true);
  });

  it("filters the table by situation", async () => {
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Excluídos · 1" }));
    expect(screen.getAllByText("Lucas M.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Juliana Prado")).not.toBeInTheDocument();
  });

  it("shows the pending bonus ball and the exception tag on the numbers", () => {
    renderDetail();
    expect(screen.getAllByTitle("Bônus liberado, aguardando escolha").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Exceção liberada pela loja").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1 número aguardando escolha").length).toBeGreaterThan(0);
  });

  it("opens the participant ficha with the exception buttons and who released what", async () => {
    renderDetail();
    await userEvent.click(screen.getAllByRole("button", { name: "Thiago Ramos" })[0]);
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByText("Exceção: Trouxe amigas")).toBeInTheDocument();
    expect(within(ficha).getByText(/Liberado por Ana Costa/)).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Número extra" })).toBeInTheDocument();
    expect(within(ficha).getByText("Validado: todas as obrigatórias conferidas")).toBeInTheDocument();
  });
});
