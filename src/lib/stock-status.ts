import type { StockItem } from "./types";

/** Whether a stock item is fully out of stock (drives the amber "sem estoque" chip). */
export function insumoOutOfStock(item: StockItem): boolean {
  return item.qty <= 0;
}
