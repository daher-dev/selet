/**
 * Rendimento de um pote (contínuo): quantos usos a embalagem deveria render,
 * a partir do que as receitas tiram dela por uso (ex.: 550 g ÷ 30 g ≈ 18 usos).
 */

/** Previsão de usos por embalagem; undefined quando nenhuma receita informa a quantidade. */
export function expectedUses(pkgSize: number | undefined, perUse: number[]): number | undefined {
  const qtys = perUse.filter((q) => q > 0);
  if (!pkgSize || qtys.length === 0) return undefined;
  const avg = qtys.reduce((a, b) => a + b, 0) / qtys.length;
  return Math.max(1, Math.floor(pkgSize / avg));
}

/** usos reais ÷ previstos, em %, ou undefined sem previsão. */
export function yieldPercent(usos: number, expected: number | undefined): number | undefined {
  return expected ? Math.round((usos / expected) * 100) : undefined;
}

/** "Pote anterior rendeu 18 usos (100%)" — the ledger note written when a new package is opened. */
export function lastPackageNote(usos: number | undefined, expected: number | undefined): string | undefined {
  if (usos == null) return undefined;
  const pct = yieldPercent(usos, expected);
  return `Pote anterior rendeu ${usos} ${usos === 1 ? "uso" : "usos"}${pct != null ? ` (${pct}%)` : ""}`;
}
