import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingBag,
  User,
  Box,
  CupSoda,
  Dessert,
  Layers,
  CreditCard,
  Ticket,
  Users,
} from "lucide-react";
import type { Section } from "@/lib/types";

/** Live counters the shell can surface on a nav item. */
export type NavBadge = "openOrders" | "cartelasAtivas";
export type NavDot = "lowStock";
/** Badge pill color — defaults to the primary green when unset. */
export type NavBadgeTone = "primary" | "amber";

export interface NavItem {
  label: string;
  /** path segment under /s/[storeId]; "" = dashboard */
  segment: string;
  icon: LucideIcon;
  /** section permission required; null = visible to any member */
  section: Section | null;
  /** live count pill (design: Pedidos open-orders badge) */
  badge?: NavBadge;
  /** badge pill color; omitted = primary green */
  badgeTone?: NavBadgeTone;
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
  { label: "Cardápio", segment: "produtos", icon: Box, section: "produtos" },
  {
    label: "Shakes",
    segment: "shakes",
    icon: CupSoda,
    // Grantable like every other operational module (see GRANTABLE_SECTIONS
    // in src/lib/types.ts) — a funcionário sees this once an admin toggles
    // it on for them. No extra gating needed here, canAccessSection()/the
    // sidebar filter already handle it.
    section: "shakes",
  },
  {
    label: "Pudim",
    segment: "pudim",
    icon: Dessert,
    // Grantable like Shakes (see GRANTABLE_SECTIONS in src/lib/types.ts) — a
    // funcionário sees this once an admin toggles it on for them.
    section: "pudim",
  },
  {
    label: "Cartelas",
    segment: "cartelas",
    icon: Ticket,
    section: "cartelas",
    badge: "cartelasAtivas",
    badgeTone: "amber",
  },
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
