/**
 * Domain types. Firestore document shapes live in src/data/ (with Timestamps);
 * these are the serialized shapes the UI receives (dates as ISO strings,
 * money as integer centavos).
 */

export const SECTIONS = [
  "pedidos",
  "clientes",
  "produtos",
  "estoque",
  "financeiro",
  "equipe",
] as const;
export type Section = (typeof SECTIONS)[number];

export const ORDER_CHANNELS = ["instagram", "whatsapp", "loja"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_STATUSES = [
  "novo",
  "preparando",
  "entrega",
  "concluido",
  "cancelado",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAY_METHODS = ["pix", "cartao", "dinheiro"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const STOCK_CATEGORIES = [
  "bebidas",
  "hortifruti",
  "proteinas",
  "secos",
  "base",
] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

export const STOCK_UNITS = ["g", "ml", "L", "kg", "un"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export type UserRole = "admin" | "funcionario";
export type UserStatus = "ativo" | "inativo" | "convidado";

export interface SessionUser {
  email: string;
  uid: string | null;
  name: string;
  phone?: string;
  role: UserRole;
  storeIds: string[] | "all";
  sections: Section[];
  status: UserStatus;
}

export interface Store {
  id: string;
  name: string;
  sub: string;
  initial: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number; // centavos
  addons?: string[];
}

export interface Order {
  id: string;
  code: string; // short display code derived from id, e.g. "A3F8"
  customerId: string | null;
  customerName: string;
  channel: OrderChannel;
  items: OrderItem[];
  total: number; // centavos
  status: OrderStatus;
  paid: boolean;
  payMethod: PayMethod | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  instagram?: string;
  birthday?: { day: number; month: number };
  since: string;
  tags: string[];
  notes?: string;
  archived: boolean;
  orderCount: number;
  totalSpent: number; // centavos
  lastOrderAt: string | null;
  avgReorderDays: number | null;
}

export const PRODUCT_CATEGORIES = [
  "bowls",
  "sopas",
  "salgados",
  "bebidas",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_TYPE_TAGS = [
  "vegano",
  "vegetariano",
  "sem-lactose",
  "sem-gluten",
  "proteico",
] as const;
export type ProductTypeTag = (typeof PRODUCT_TYPE_TAGS)[number];

export interface Product {
  id: string;
  name: string;
  price: number; // centavos
  category: string;
  typeTags: string[];
  active: boolean;
  createdAt: string;
}

export interface StockItem {
  id: string;
  name: string;
  category: StockCategory;
  unit: StockUnit;
  /** rastreado: packaging ledger (sealed packages + open loose amount) */
  tracked: boolean;
  pkgLabel?: string;
  pkgSize?: number; // base units per package
  sealed: number; // sealed package count (tracked items)
  open: number; // loose amount in base unit
  /** total in base unit; tracked items: sealed*pkgSize + open */
  qty: number;
  /** contínuo: consumed without per-use measurement, only package opens */
  continuousUse: boolean;
  resellable: boolean;
  cost?: number; // centavos per package (tracked) or base unit
  sellPrice?: number; // centavos, resellable items
  reorderAt: number;
  lowStock: boolean;
  yieldPct?: number; // rendimento
  updatedAt: string;
}

export const STOCK_MOVEMENT_TYPES = ["entrada", "saida", "abertura"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovement {
  id: string;
  type: StockMovementType;
  /** entrada/saida: base units, or packages when byPackage */
  qty: number;
  byPackage: boolean;
  price?: number; // centavos, entradas
  reason?: string;
  by: string; // user email
  at: string;
}

export interface FinanceTx {
  id: string;
  label: string;
  category: string;
  amount: number; // centavos, always positive
  direction: "in" | "out";
  source: "order" | "manual";
  orderId?: string;
  payMethod?: PayMethod;
  date: string;
}

export interface TeamMember extends SessionUser {
  invitedAt: string;
  firstLoginAt?: string;
}

export interface ActivityEntry {
  id: string;
  icon: string;
  label: string;
  detail: string;
  by: string;
  at: string;
}
