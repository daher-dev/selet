import { CircleHelp } from "lucide-react";
import { MessageScreen } from "./parts";

export default function RaffleNotFound() {
  return (
    <MessageScreen
      eyebrow="selet.app/s/…"
      icon={CircleHelp}
      tone="grey"
      title="Esse sorteio não está disponível"
      text="Confira se o link está completo. Se ele veio de alguém, peça o link de novo."
      actions={[{ label: "Ir para o Instagram da Selet", href: "https://instagram.com" }]}
    />
  );
}
