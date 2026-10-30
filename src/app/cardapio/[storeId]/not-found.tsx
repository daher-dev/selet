import { BookOpen } from "lucide-react";
import { MessageScreen } from "@/app/s/[slug]/parts";

export default function MenuNotFound() {
  return (
    <MessageScreen
      eyebrow="Cardápio"
      icon={BookOpen}
      tone="grey"
      title="Esse cardápio não está disponível"
      text="Confira se o link está completo, ou peça o cardápio pelo WhatsApp da loja."
      actions={[]}
    />
  );
}
