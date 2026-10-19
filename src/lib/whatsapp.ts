import "server-only";

/**
 * Outbound WhatsApp messages (login codes, sorteio results).
 *
 * No provider is wired yet — this is the seam where one plugs in. Until then
 * messages are only logged, and only when it is safe to pretend: local dev and
 * the Firestore emulator (e2e). In production it throws, so a sorteio never
 * claims a code or a result notice was delivered when it was not.
 */
export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("O envio por WhatsApp ainda não está configurado.");
    this.name = "WhatsAppNotConfiguredError";
  }
}

/** True when messages may be logged instead of sent (never in real production). */
export function whatsappIsStubbed(): boolean {
  return (
    !!process.env.FIRESTORE_EMULATOR_HOST || process.env.NODE_ENV !== "production"
  );
}

/** `to` is the destination as DDD + 9 digits. */
export async function sendWhatsApp(to: string, text: string): Promise<void> {
  if (!whatsappIsStubbed()) throw new WhatsAppNotConfiguredError();
  console.info(`[whatsapp:stub] to=${to} text=${JSON.stringify(text)}`);
}
