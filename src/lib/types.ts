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
  "cartelas",
  "shakes",
  "equipe",
] as const;
export type Section = (typeof SECTIONS)[number];

// The modules a funcionário can be granted access to. Only "equipe" (team
// management) is admin-only by design — it stays in SECTIONS so nav gating
// keeps working (admins see the Equipe item via their role), but it is
// intentionally NOT grantable: a funcionário can never be given
// team-management rights through the member form or a server action, since
// that would let staff manage other staff's own access.
//
// "shakes" was excluded here until a bug report surfaced that some
// funcionários genuinely need it (staff building shakes at the counter) but
// had no way to be granted it — there was no toggle for it anywhere, and
// the server action rejected it even if one existed (z.enum(GRANTABLE_SECTIONS)
// below). It's now grantable like every other operational module.
export const GRANTABLE_SECTIONS = [
  "pedidos",
  "clientes",
  "produtos",
  "estoque",
  "financeiro",
  "cartelas",
  "shakes",
] as const;
export type GrantableSection = (typeof GRANTABLE_SECTIONS)[number];

export const ORDER_CHANNELS = ["instagram", "whatsapp", "loja", "interno"] as const;
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

export const DISCOUNT_KINDS = ["flat", "percent", "free"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const DISCOUNT_REASONS = [
  "cortesia",
  "consumo-interno",
  "combinado",
  "erro-preparo",
] as const;
export type DiscountReason = (typeof DISCOUNT_REASONS)[number];

/**
 * Manual, order-level discount (orthogonal to per-line cartela coverage).
 * `value` is centavos for "flat", whole 1-100 for "percent", always 0 for
 * "free". `amount` is server-computed centavos — never trust a client-sent
 * amount (see src/lib/order-money.ts). `reason` is optional even for "free".
 */
export interface OrderDiscount {
  kind: DiscountKind;
  value: number;
  amount: number; // centavos, server-computed
  reason?: DiscountReason;
}

// Stock categories. The first four are the café working-insumo food groups the
// design uses (Secos, Proteínas, Bebidas, Hortifrúti). "suplementos" and
// "beleza" were added for the Herbalife retail distributor catalog — products
// tracked in inventory but not (yet) resold from the café menu.
export const STOCK_CATEGORIES = [
  "secos",
  "proteinas",
  "bebidas",
  "hortifruti",
  "suplementos",
  "beleza",
] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

export const STOCK_UNITS = ["g", "ml", "L", "kg", "un", "sache"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

// How an item's open package is consumed. "medido": deduct a measured amount
// (g/un/sachê) per use. "continuo": not measured per use — the open package is
// tracked by a `usos` counter and marked empty after N uses.
export const CONSUMPTION_MODES = ["medido", "continuo"] as const;
export type ConsumptionMode = (typeof CONSUMPTION_MODES)[number];

/**
 * Unit → consumption-mode rule (single source of truth, reused by the app and
 * the import/seed scripts). WEIGHT/VOLUME items (g/kg/ml/L) are never weighed
 * per use: they are "contínuo" — tracked by a `usos` counter and marked empty.
 * COUNTABLE items (un/sachê) are "medido" — deducted by an exact count.
 */
export function isWeightVolumeUnit(unit: string): boolean {
  return unit === "g" || unit === "kg" || unit === "ml" || unit === "L";
}
export function consumptionModeForUnit(unit: string): ConsumptionMode {
  return isWeightVolumeUnit(unit) ? "continuo" : "medido";
}

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
  /** Area code prefilled on new-client phone inputs (e.g. "35" for Passos/MG). */
  defaultDDD?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number; // centavos
  addons?: string[];
  /** Present only for "Montar shake" lines; mutually exclusive with `addons`. */
  shake?: ShakeSelection;
  /** Present only on the line that SELLS a new cartela; qty is always 1. */
  cartelaSale?: { paidUses: number; totalUses: number; unitValue: number };
  /**
   * Present on a line a cartela paid down. `unitPrice` is already net of
   * `covered` (folds in exactly like addons already do, per the existing
   * order-sheet.tsx convention).
   */
  cartelaUse?: { cartelaId: string; code: string; uses: number; covered: number; listPrice: number };
}

/**
 * One reversible unit of stock the order drew when it was placed. Persisted on
 * the order so cancel/uncancel/update can apply the EXACT inverse regardless of
 * how the product's recipe changes afterwards.
 *  - kind "insumo": a tracked stockItems doc. medido → `amount` base units were
 *    deducted (reverse by returning them). continuo → `usos` uses were tallied
 *    on the open package (reverse by subtracting).
 *  - kind "produced": a stockManaged product's finished-goods count. `amount`
 *    porções were drawn from product.producedStock (reverse by adding back).
 */
export interface ConsumptionDraw {
  kind: "insumo" | "produced";
  /** stockItems doc id (insumo) or products doc id (produced). */
  refId: string;
  mode?: ConsumptionMode;
  amount?: number;
  usos?: number;
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
  /** Reversal manifest — the stock this order currently holds (empty when cancelled). */
  stockConsumed: ConsumptionDraw[];
  /** Reversal manifest — the cartela uses this order currently holds (empty when cancelled). */
  cartelaConsumed: { cartelaId: string; uses: number }[];
  /** Cartela ids created (sold) by this order — used by the cancel cascade. */
  cartelaSold: string[];
  /** Manual order-level discount (applied after cartela coverage, before total). */
  discount?: OrderDiscount | null;
  /** Free-text order note, visible to the team only (never shown in list rows). */
  notes?: string;
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
// that consumes stock; "revenda" = a stock item resold directly; "adicional"
// = not independently orderable, only offered as a live-linked add-on inside
// other products (stock behaves like revenda: a single optional insumo link).
export const PRODUCT_SALE_TYPES = ["menu", "revenda", "adicional"] as const;
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
  price: number; // centavos, extra charge (mirrors the qty:1 tier below)
  qty?: number | null;
  unit?: string;
  /** Optional price tiers (e.g. "2 doses" costs more than 1) — lets an addon
   *  carry its own price list without promoting it to a full catalog product. */
  tiers?: PriceTier[];
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
  /** BASE recipe (menu items). Empty for revenda/adicional. */
  recipe: RecipeItem[];
  /** Optional add-ons (menu items). Empty for revenda/adicional. */
  adicionais: ProductAddon[];
  /** Price tiers; always includes the unit (qty:1) tier. */
  tiers: PriceTier[];
  /** Linked stock item slug (revenda/adicional items link one insumo). */
  insumoId?: string;
  /** Whether a menu item is produced in batches and kept in stock (drives "Produzir"). */
  stockManaged: boolean;
  /** Finished units on hand (only meaningful for stockManaged menu items; default 0). */
  producedStock: number;
  /** Production mode: on-demand vs batch/lote (e.g. Coxinha). undefined for revenda/adicional. */
  prep?: "sob demanda" | "lote" | null;
  /** Prep/shelf duration in minutes (metadata shown on the catalog card). */
  duration?: number;
  /** Hidden from the default catálogo list (e.g. old retail SKUs archived on sync). */
  archived: boolean;
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
  source: "order" | "manual" | "stock";
  orderId?: string;
  payMethod?: PayMethod;
  date: string;
}

// --- Cartelas: single product-agnostic punch cards sold ad hoc (no
// template/"Modelos" screen). N paid uses at one fixed R$ value each, plus one
// bonus free "brinde" use built in (totalUses = paidUses + 1). No expiry, no
// per-cartela payment-status field — money flows through the order that sold
// it (see OrderItem.cartelaSale), never a separate finance mirror doc. ---

export type CartelaStatus = "ativa" | "esgotada" | "cancelada";

/** One redemption event, appended to Cartela.uses in the order it happened. */
export interface CartelaUse {
  orderId: string;
  orderCode: string;
  productName: string;
  at: string;
}

/**
 * A punch card. `uses` is the ONLY source of truth for how much has been
 * redeemed — remaining/balance/status/punch-dot rendering are always derived
 * from `uses.length` vs `totalUses` (see src/lib/cartelas.ts), never persisted
 * separately. Punch order: index 0 of the card is always the brinde (free,
 * consumed first); indices 1..N are the paid uses, consumed in order.
 */
export interface Cartela {
  id: string;
  code: string; // short display code derived from id, e.g. "C3F8" (mirrors Order.code)
  customerId: string;
  customerName: string;
  paidUses: number;
  totalUses: number; // paidUses + 1 (the brinde)
  unitValue: number; // centavos, the fixed value a single use is worth
  amount: number; // centavos, paidUses * unitValue — what was actually charged
  uses: CartelaUse[];
  status: CartelaStatus;
  soldOnOrderId: string;
  purchasedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember extends SessionUser {
  invitedAt: string;
  firstLoginAt?: string;
}

export interface ActivityEntry {
  id: string;
  /** lucide icon name (kebab-case, e.g. "inbox", "circle-check"). */
  icon: string;
  label: string;
  detail: string;
  /** Acting user email. */
  by: string;
  at: string;
  /** The module the event belongs to (for filtering/metadata). */
  section?: Section;
}

// --- Shakes: a shared, store-wide modifier catalog for build-a-shake orders,
// replacing the old per-flavor duplicated ProductAddon lists. A "Sabor" is a
// slimmed, standalone entity (not a Product) — see src/data/shakes.ts. ---

/** Max number of sabores a single "Montar shake" line may select ("até 3"). */
export const MAX_SHAKE_FLAVORS = 3;

/** A flavor's own insumo list — reuses RecipeItem verbatim ("insumos do sabor"). */
export interface ShakeFlavor {
  id: string;
  name: string;
  price: number; // centavos, "R$ X / copo"
  recipe: RecipeItem[];
  archived: boolean;
  createdAt: string;
}

/** Single-choice modifier (picked once per order), usually free with an optional flat surcharge. */
export interface ShakeBase {
  id: string;
  name: string;
  insumo: RecipeItem;
  price: number; // centavos, "Acréscimo"; 0 = incluso no preço do sabor
  archived: boolean;
  createdAt: string;
}

/** "Borda" — charged separately, quantity-tiered (supports dose dupla via PriceTier). */
export interface ShakeRim {
  id: string;
  name: string;
  insumo: RecipeItem;
  tiers: PriceTier[];
  archived: boolean;
  createdAt: string;
}

/**
 * Shake-scoped "Adicional" — unlimited multi-select, quantity-tiered, shared
 * across all flavors. Named ShakeMixin (not ShakeAddon) to avoid colliding
 * with ProductAddon (a Product's own list) and ProductSaleType's "adicional"
 * (standalone catalog SKUs) — the Portuguese UI copy still says "Adicionais".
 */
export interface ShakeMixin {
  id: string;
  name: string;
  insumo: RecipeItem;
  tiers: PriceTier[];
  archived: boolean;
  createdAt: string;
}

/** Never priced/shown on the order — pure stock draw, opt-in/out per order line. */
export interface ShakeUtensil {
  id: string;
  name: string;
  insumo: RecipeItem;
  /** "Padrão em todo shake" — auto-applies unless overridden per order line. */
  defaultIncluded: boolean;
  archived: boolean;
  createdAt: string;
}

/**
 * A café menu Product given away free alongside a "Montar shake" order line.
 * `id === productId` — pure join against products, no recipe/price of its
 * own; always read the LIVE Product for display (name/category/price).
 */
export interface ShakeBrinde {
  id: string;
  productId: string;
  name: string;
  archived: boolean;
  createdAt: string;
}

/**
 * A "Montar shake" order line's chosen brinde. `listPrice` is the struck-
 * through menu price (charged as 0); `addons` are the brinde's own add-ons
 * the customer still pays for, money-snapshotted at order time so a later
 * menu re-price never rewrites a historical order's price.
 */
export interface ShakeBrindeSelection {
  productId: string;
  name: string;
  listPrice: number; // centavos, struck-through; charged as 0
  addons?: { name: string; price: number }[]; // still charged, snapshotted
}

/** A "Montar shake" order line's picks, embedded on OrderItem.shake. */
export interface ShakeSelection {
  /** 1 to MAX_SHAKE_FLAVORS sabor ids; pricing/productId use the primary (max-price) flavor. */
  flavorIds: string[];
  baseId: string | null;
  rims: { modifierId: string; qty: number }[];
  mixins: { modifierId: string; qty: number }[];
  /** Per-order overrides against each utensílio's catalog default. Absent id = use current default. */
  utensilOverrides?: { utensilId: string; included: boolean }[];
  brinde?: ShakeBrindeSelection;
}
