import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingBag,
  User,
  Box,
  Layers,
  CreditCard,
  Users,
} from "lucide-react";
import type { Section } from "@/lib/types";

/** Live counters the shell can surface on a nav item. */
export type NavBadge = "openOrders";
export type NavDot = "lowStock";

export interface NavItem {
  label: string;
  /** path segment under /s/[storeId]; "" = dashboard */
  segment: string;
  icon: LucideIcon;
  /** section permission required; null = visible to any member */
  section: Section | null;
  /** live count pill (design: Pedidos open-orders badge) */
  badge?: NavBadge;
  /** pulsing alert dot (design: Estoque low-stock dot) */
  dot?: NavDot;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", segment: "", icon: LayoutDashboard, section: null },
  {
    label: "Pedidos",
    segment: "pedidos",
    icon: ShoppingBag,
    section: "pedidos",
    badge: "openOrders",
  },
  { label: "Clientes", segment: "clientes", icon: User, section: "clientes" },
  { label: "Catálogo", segment: "produtos", icon: Box, section: "produtos" },
  {
    label: "Estoque",
    segment: "estoque",
    icon: Layers,
    section: "estoque",
    dot: "lowStock",
  },
  {
    label: "Financeiro",
    segment: "financeiro",
    icon: CreditCard,
    section: "financeiro",
  },
  { label: "Equipe", segment: "equipe", icon: Users, section: "equipe" },
];
