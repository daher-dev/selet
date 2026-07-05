const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Formats integer centavos as BRL: 123456 → "R$ 1.234,56" */
export function formatBRL(centavos: number): string {
  return brl.format(centavos / 100);
}

/** Parses a pt-BR money string ("1.234,56" or "1234,56") into centavos. */
export function parseBRL(input: string): number {
  const normalized = input.replace(/[R$\s.]/g, "").replace(",", ".");
  const value = Number(normalized);
  if (Number.isNaN(value)) throw new Error(`Valor inválido: ${input}`);
  return Math.round(value * 100);
}

const dateShort = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const dateFull = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateShort(iso: string): string {
  return dateShort.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFull.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** Relative time in pt-BR: "há 5 min", "há 2 h", "ontem", else short date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD} dias`;
  return dateShort.format(then);
}

/** Display code for an order doc ID: first 4 chars, uppercased. */
export function orderCode(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

/** "Maria Silva" → "MS" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Quantity with unit: 1500 g → "1,5 kg" style normalization left to caller; plain join. */
export function formatQty(qty: number, unit: string): string {
  const n = Number.isInteger(qty)
    ? qty.toLocaleString("pt-BR")
    : qty.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${n} ${unit}`;
}
