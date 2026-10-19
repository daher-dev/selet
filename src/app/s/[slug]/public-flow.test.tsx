// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { registerAction, startAction, verifyCodeAction } from "@/actions/raffle-public";
import { PublicFlow, type PublicRaffleView } from "./public-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/actions/raffle-public", () => ({
  startAction: vi.fn(),
  sendCodeAction: vi.fn(),
  verifyCodeAction: vi.fn(),
  registerAction: vi.fn(),
  pickBonusAction: vi.fn(),
  adoptTokenAction: vi.fn(async () => ({ ok: true })),
}));

const raffle: PublicRaffleView = {
  name: "Aniversário Selet 3 anos",
  prize: "1 mês de shakes",
  location: "Ao vivo no Instagram @selet.vv",
  drawAt: "2026-10-30T19:00:00-03:00",
  signupFrom: null,
  numberFrom: 1,
  numberTo: 30,
  perPerson: 1,
  rules: [
    { text: "Seguir @selet.vv", type: "obr" },
    { text: "Convidar alguém para o grupo VIP", type: "bonus" },
  ],
  fields: { instagram: true, birthday: false, email: false },
  winner: null,
  regulamentoAt: "2026-10-18T10:00:00-03:00",
};

function renderFlow(over: Partial<React.ComponentProps<typeof PublicFlow>> = {}) {
  return render(
    <PublicFlow
      slug="aniversario-3-anos"
      raffle={raffle}
      state="aberto"
      taken={[3, 7]}
      total={30}
      entry={null}
      adoptToken={null}
      regulamento={[{ title: "Período", lines: ["Inscrições até 29/10."] }]}
      participants={0}
      codes
      {...over}
    />,
  );
}

async function goToPhone(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.click(screen.getByRole("button", { name: /Quero participar/ }));
  await user.type(screen.getByLabelText("WhatsApp"), phone);
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
});

describe("PublicFlow", () => {
  it("opens with the prize, the date and how many numbers are free", () => {
    renderFlow();
    expect(screen.getByText("Concorra a 1 mês de shakes")).toBeInTheDocument();
    expect(screen.getByText("30/10, às 19h")).toBeInTheDocument();
    expect(screen.getByText("28 livres")).toBeInTheDocument();
    expect(screen.getByText(/Bônus: convidar alguém para o grupo VIP/)).toBeInTheDocument();
  });

  it("does not call the server for an incomplete WhatsApp", async () => {
    const user = userEvent.setup();
    renderFlow();
    await goToPhone(user, "27991");
    expect(screen.getByText(/Número incompleto/)).toBeInTheDocument();
    expect(startAction).not.toHaveBeenCalled();
  });

  it("walks a new person through data and number, and keeps the cadastro when the number was taken", async () => {
    const user = userEvent.setup();
    vi.mocked(startAction).mockResolvedValue({ ok: true, kind: "new", phoneEnd: "9999", resendIn: 0 });
    vi.mocked(registerAction)
      .mockResolvedValueOnce({ ok: false, error: "O 12 acabou de ser escolhido por outra pessoa.", taken: 12 })
      .mockResolvedValueOnce({
        ok: true,
        entry: { name: "Juliana Prado", instagram: "juprado", numbers: [{ n: 13, kind: "cadastro" }], pendingSlots: 0, missing: ["Seguir @selet.vv"], status: "pend" },
      });
    renderFlow();

    await goToPhone(user, "27999990001");
    await user.click(await screen.findByRole("button", { name: "Escolher meu número" }));
    expect(screen.getByText("Falta 3 campos")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Como você se chama"), "Juliana Prado");
    await user.type(screen.getByPlaceholderText("seuperfil"), "juprado");
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Escolher meu número" }));

    // taken numbers are not selectable
    expect(screen.getByRole("button", { name: "Número 7, ocupado" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Número 12" }));
    await user.click(screen.getByRole("button", { name: "Confirmar o nº 12" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O 12 acabou de ser escolhido");
    expect(screen.getByRole("button", { name: "Número 12, ocupado" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Número 13" }));
    await user.click(screen.getByRole("button", { name: "Confirmar o nº 13" }));
    expect(await screen.findByText("Número 13 é seu, Juliana!")).toBeInTheDocument();
    expect(screen.getByText("Seguir @selet.vv")).toBeInTheDocument();
    expect(registerAction).toHaveBeenLastCalledWith(
      "aniversario-3-anos",
      expect.objectContaining({ phone: "(27) 9 9999-0001", name: "Juliana Prado", instagram: "juprado", picks: [13], aceite: true }),
    );
  });

  it("lets a returning person confirm the WhatsApp code and loads their data", async () => {
    const user = userEvent.setup();
    vi.mocked(startAction).mockResolvedValue({ ok: true, kind: "known", phoneEnd: "4432", resendIn: 30 });
    vi.mocked(verifyCodeAction).mockResolvedValue({
      ok: true,
      entry: null,
      profile: { name: "Juliana Prado", instagram: "juprado", novidades: true },
    });
    renderFlow();

    await goToPhone(user, "27991204432");
    expect(await screen.findByText("Que bom te ver de novo!")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("······"), "123456");
    await waitFor(() => expect(verifyCodeAction).toHaveBeenCalledWith("aniversario-3-anos", "(27) 9 9120-4432", "123456"));
    expect(await screen.findByText("Oi, Juliana! Tá tudo certo?")).toBeInTheDocument();
  });

  it("shows closed, sold-out and result screens instead of the form", () => {
    const { unmount } = renderFlow({ state: "encerrado" });
    expect(screen.getByText("Inscrições encerradas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver meus números" })).toBeInTheDocument();
    unmount();

    const full = renderFlow({ state: "esgotado" });
    expect(screen.getByText("Os 30 números já têm dono")).toBeInTheDocument();
    full.unmount();

    renderFlow({
      state: "resultado",
      raffle: { ...raffle, winner: { number: 88, name: "Mariana L." } },
      participants: 48,
      taken: Array.from({ length: 52 }, (_, i) => i + 1),
    });
    expect(screen.getByText("Mariana L. ganhou!")).toBeInTheDocument();
    expect(screen.getByText(/48 participantes · 52 números/)).toBeInTheDocument();
  });

  it("shows the person's numbers on a remembered device, with the bonus pick when released", () => {
    renderFlow({
      entry: { name: "Thiago Ramos", instagram: "thiramos", numbers: [{ n: 150, kind: "cadastro" }], pendingSlots: 1, missing: [], status: "ok" },
    });
    expect(screen.getByText("Número 150 é seu, Thiago!")).toBeInTheDocument();
    expect(screen.getByText("Você ganhou +1 número!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher meu número bônus" })).toBeInTheDocument();
  });

  it("without WhatsApp codes, a number already in the raffle is told to talk to the store (no code button)", async () => {
    const user = userEvent.setup();
    vi.mocked(startAction).mockResolvedValue({ ok: true, kind: "dup", phoneEnd: "4432", resendIn: 0 });
    renderFlow({ codes: false });
    await goToPhone(user, "27991204432");
    expect(await screen.findByText("Esse WhatsApp já está no sorteio")).toBeInTheDocument();
    expect(screen.getByText(/Para ver qual é, fale com a loja/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receber código no WhatsApp" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar outro WhatsApp" })).toBeInTheDocument();
  });

  it("without WhatsApp codes, the closed screens do not offer 'ver meus números'", () => {
    const closed = renderFlow({ state: "encerrado", codes: false });
    expect(screen.getByText("Inscrições encerradas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver meus números" })).not.toBeInTheDocument();
    closed.unmount();

    renderFlow({ state: "esgotado", codes: false });
    expect(screen.queryByRole("button", { name: /Ver meus números/ })).not.toBeInTheDocument();
  });
});
