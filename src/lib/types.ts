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

// The modules a funcionário can be granted access to. Team management
// ("equipe") is admin-only by design — its access catalog is exactly these
// five modules (design aclSections, Selet Admin.dc.html:2415-2423). "equipe"
// stays in SECTIONS so nav gating keeps working (admins see the Equipe item via
// their role), but it is intentionally NOT grantable: a funcionário can never
// be given team-management rights through the member form or a server action.
export const GRANTABLE_SECTIONS = [
  "pedidos",
  "clientes",
  "produtos",
  "estoque",
  "financeiro",
] as const;
export type GrantableSection = (typeof GRANTABLE_SECTIONS)[number];

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

// Café working-insumo categories (the recipe-ingredient food groups the design
// uses): Secos, Proteínas, Bebidas, Hortifrúti. These replace the earlier
// Herbalife retail distributor lines — Selet is modeled as a café/nutrition bar.
export const STOCK_CATEGORIES = [
  "secos",
  "proteinas",
  "bebidas",
  "hortifruti",
] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

export const STOCK_UNITS = ["g", "ml", "L", "kg", "un", "sache"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

// How an item's open package is consumed. "medido": deduct a measured amount
// (g/un/sachê) per use. "continuo": not measured per use — the open package is
// tracked by a `usos` counter and marked empty after N uses.
export const CONSUMPTION_MODES = ["medido", "continuo"] as const;
export type ConsumptionMode = (typeof CONSUMPTION_MODES)[number];

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
  /** Predicted repurchase product (names *what* to re-offer in the reorder card). */
  reorderProduct?: string | null;
}

// Café menu sections (CARDÁPIO): Shakes (Gourmet + Tradicional), Waffle,
// Refeições Salgadas, Bebidas e Chás, Lanches rápidos, Extras.
export const PRODUCT_CATEGORIES = [
  "shakes",
  "waffles",
  "salgados",
  "bebidas",
  "lanches",
  "adicionais",
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

// How a catalog item is sold. "menu" = prepared in-store from a recipe (BASE)
// that consumes stock; "revenda" = a stock item resold directly.
export const PRODUCT_SALE_TYPES = ["menu", "revenda"] as const;
export type ProductSaleType = (typeof PRODUCT_SALE_TYPES)[number];

/**
 * One BASE ingredient of a prepared (menu) item. Name-based (mirrors the real
 * café recipe cards): `stockItemId` links to a stockItems doc when the
 * ingredient is a tracked Herbalife insumo, but stays undefined for untracked
 * pantry items (Ninho, Morango…). `qty: null` renders as "sem medição".
 */
export interface RecipeItem {
  stockItemId?: string;
  name: string;
  qty: number | null;
  unit: string;
}

/** An optional add-on for a menu item — also a consumed item, with an extra price. */
export interface ProductAddon {
  stockItemId?: string;
  name: string;
  price: number; // centavos, extra charge
  qty?: number | null;
  unit?: string;
}

/** Price-by-quantity row. The `qty: 1` tier is the unit price; higher tiers are lote/batches. */
export interface PriceTier {
  qty: number;
  price: number; // centavos
}

export interface Product {
  id: string;
  name: string;
  price: number; // centavos — the unit price (mirrors the qty:1 tier)
  category: string;
  typeTags: string[];
  description?: string;
  active: boolean;
  createdAt: string;
  /** Sale type — defaults to "menu" for legacy docs without the field. */
  saleType: ProductSaleType;
  /** BASE recipe (menu items). Empty for revenda. */
  recipe: RecipeItem[];
  /** Optional add-ons (menu items). Empty for revenda. */
  adicionais: ProductAddon[];
  /** Price tiers; always includes the unit (qty:1) tier. */
  tiers: PriceTier[];
  /** Linked stock item slug (revenda items resell one insumo). */
  insumoId?: string;
  /** Whether a menu item is produced in batches and kept in stock (drives "Produzir"). */
  stockManaged: boolean;
  /** Production mode: on-demand vs batch/lote (e.g. Coxinha). undefined for revenda. */
  prep?: "sob demanda" | "lote" | null;
  /** Prep/shelf duration in minutes (metadata shown on the catalog card). */
  duration?: number;
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
  /** How the open package is consumed: measured amount vs mark-empty-after-N-uses. */
  consumptionMode: ConsumptionMode;
  /** contínuo: whether a package is currently open and being consumed (usos accrue on it). */
  openPkg: boolean;
  /** Uses tallied on the currently-open package (contínuo items); reset on next open. */
  usos: number;
  resellable: boolean;
  cost?: number; // centavos per package (tracked) or base unit
  sellPrice?: number; // centavos, resellable items
  reorderAt: number;
  lowStock: boolean;
  yieldPct?: number; // rendimento
  /** hidden from the default estoque list (e.g. non-food resale lines) */
  archived: boolean;
  updatedAt: string;
}

export const STOCK_MOVEMENT_TYPES = ["entrada", "saida", "abertura"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

// The semantic cause of a movement (the design's reason taxonomy). `type` is the
// physical direction; `reason` is why: manual adjust, restock, loss, a sale, or
// consumption by production.
export const STOCK_MOVEMENT_REASONS = [
  "AJUSTE",
  "ENTRADA",
  "SAIDA",
  "VENDA",
  "CONSUMO",
  "PERDA",
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export interface StockMovement {
  id: string;
  type: StockMovementType;
  /** entrada/saida: base units, or packages when byPackage */
  qty: number;
  byPackage: boolean;
  price?: number; // centavos, entradas
  reason?: StockMovementReason;
  /** The order this movement fulfilled (VENDA). */
  refOrder?: string;
  /** The product/menu item this movement was consumed for (CONSUMO/production). */
  refItem?: string;
  by: string; // user email
  at: string;
}

export const FINANCE_CATEGORIES = [
  "vendas",
  "compras",
  "salarios",
  "aluguel",
  "marketing",
  "outros",
] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

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
