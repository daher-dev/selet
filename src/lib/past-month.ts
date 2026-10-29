import { monthKey } from "./timezone";

/** True when `mk` ("YYYY-MM", store timezone) is before the current month — its numbers may already be reported or closed. */
export function isPastMonth(mk: string, now: Date = new Date()): boolean {
  return mk < monthKey(now);
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09" → "setembro de 2026" */
export function monthLabel(mk: string): string {
  const [y, m] = mk.split("-");
  return `${MONTHS[Number(m) - 1]} de ${y}`;
}
