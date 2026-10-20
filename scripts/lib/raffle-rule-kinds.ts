import { finalizeRule, type RaffleRule } from "../../src/lib/raffles";

export type RuleMigration =
  | { change: "none" }
  | { change: "follow"; rule: RaffleRule }
  /** Curtir/comentar: the post URL is not in the data, so the team has to paste it. */
  | { change: "needs-post" };

/**
 * Types a legacy free-text rule. Only "Seguir @perfil" can be inferred; the text
 * stays as written so the regulamento people accepted does not change.
 */
export function migrateRule(rule: RaffleRule): RuleMigration {
  if (rule.kind) return { change: "none" };
  if (/\b(curtir|comentar)\b/i.test(rule.text)) return { change: "needs-post" };
  const handle = /\bseguir\b/i.test(rule.text) && /@([A-Za-z0-9._]+)/.exec(rule.text)?.[1].replace(/\.+$/, "");
  if (!handle) return { change: "none" };
  const typed = finalizeRule({ ...rule, kind: "follow", link: handle });
  return typeof typed === "string" ? { change: "none" } : { change: "follow", rule: { ...typed, text: rule.text } };
}
