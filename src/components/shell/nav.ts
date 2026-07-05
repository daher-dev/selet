import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Package,
  Wallet,
  UserCog,
} from "lucide-react";
import type { Section } from "@/lib/types";

export interface NavItem {
  label: string;
  /** path segment under /s/[storeId]; "" = dashboard */
  segment: string;
  icon: LucideIcon;
  /** section permission required; null = visible to any member */
  section: Section | null;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Visão geral", segment: "", icon: LayoutDashboard, section: null },
  { label: "Pedidos", segment: "pedidos", icon: ShoppingBag, section: "pedidos" },
  { label: "Clientes", segment: "clientes", icon: Users, section: "clientes" },
  { label: "Catálogo", segment: "produtos", icon: UtensilsCrossed, section: "produtos" },
  { label: "Estoque", segment: "estoque", icon: Package, section: "estoque" },
  { label: "Financeiro", segment: "financeiro", icon: Wallet, section: "financeiro" },
  { label: "Equipe", segment: "equipe", icon: UserCog, section: "equipe" },
];
