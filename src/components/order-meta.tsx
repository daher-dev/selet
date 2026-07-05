import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Banknote,
  CreditCard,
  MessageCircle,
  QrCode,
  Store,
} from "lucide-react";
import type { OrderChannel, OrderStatus, PayMethod } from "@/lib/types";

export const CHANNEL_META: Record<
  OrderChannel,
  { label: string; icon: LucideIcon; dot: string; fg: string; bg: string }
> = {
  instagram: {
    label: "Instagram",
    icon: AtSign,
    dot: "bg-channel-instagram",
    fg: "text-channel-instagram",
    bg: "bg-channel-instagram/10",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    dot: "bg-channel-whatsapp",
    fg: "text-channel-whatsapp",
    bg: "bg-channel-whatsapp/10",
  },
  loja: {
    label: "Loja física",
    icon: Store,
    dot: "bg-channel-loja",
    fg: "text-ink-soft",
    bg: "bg-channel-loja/15",
  },
};

export const STATUS_META: Record<
  OrderStatus,
  { label: string; fg: string; bg: string }
> = {
  novo: { label: "Novo", fg: "text-info", bg: "bg-info-wash" },
  preparando: { label: "Preparando", fg: "text-amber", bg: "bg-amber-wash" },
  entrega: { label: "Entrega", fg: "text-cat-bebidas", bg: "bg-cat-bebidas-wash" },
  concluido: { label: "Concluído", fg: "text-primary", bg: "bg-mint-wash" },
  cancelado: { label: "Cancelado", fg: "text-destructive", bg: "bg-danger-wash" },
};

export const PAY_METHOD_META: Record<
  PayMethod,
  { label: string; icon: LucideIcon }
> = {
  pix: { label: "Pix", icon: QrCode },
  cartao: { label: "Cartão", icon: CreditCard },
  dinheiro: { label: "Dinheiro", icon: Banknote },
};
