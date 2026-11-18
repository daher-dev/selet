"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL, parseBRL } from "@/lib/format";
import {
  receiptConfigured,
  receiptDefaults,
  receiptFileName,
  type ReceiptData,
} from "@/lib/receipt";
import type { Order, StoreReceipt } from "@/lib/types";

export interface ReceiptContext {
  storeName: string;
  settings?: StoreReceipt;
  /** Admins (Configurações access) get the shortcut to edit the fixed data. */
  canEditSettings: boolean;
}

const LABEL = "mb-2 block text-[11px] font-bold uppercase tracking-[.4px] text-ink-faint";
const FIELD =
  "h-[46px] w-full rounded-xl border border-border bg-paper px-3.5 text-[14px] font-semibold text-ink outline-none focus:border-primary";

/** "88,00" for the amount input. */
function amountInput(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/** Centavos from the amount input, or null when it isn't a positive amount. */
export function parseAmountInput(raw: string): number | null {
  if (!/\d/.test(raw)) return null;
  try {
    const v = parseBRL(raw);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Shares the PDF on touch devices (WhatsApp etc.), downloads it elsewhere. */
async function deliverPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const file = new File([blob], fileName, { type: "application/pdf" });
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Share failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Gerar recibo" (design pedidos-8b / 8d). Nothing is saved on the order. */
export function ReceiptDialog({
  storeId,
  order,
  receipt,
  open,
  onOpenChange,
}: {
  storeId: string;
  order: Order;
  receipt: ReceiptContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[472px]">
        {open && (
          <ReceiptForm storeId={storeId} order={order} receipt={receipt} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptForm({
  storeId,
  order,
  receipt,
  onClose,
}: {
  storeId: string;
  order: Order;
  receipt: ReceiptContext;
  onClose: () => void;
}) {
  const defaults = receiptDefaults(order);
  const [customer, setCustomer] = useState(defaults.customer);
  const [amount, setAmount] = useState(amountInput(defaults.amount));
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [pending, setPending] = useState(false);

  const configured = receiptConfigured(receipt.settings);
  const cents = parseAmountInput(amount);
  const settingsHref = `/painel/${storeId}/configuracoes/loja`;
  const s = receipt.settings ?? {};
  const fixedRows: [string, string | undefined][] = [
    ["Para", s.recipient],
    ["Instituição", s.institution],
    ["Chave Pix", s.pixKey],
    ["Carteira", s.wallet],
    ["Categoria", s.category],
  ];

  async function download() {
    if (!configured || cents === null || !date || !time) return;
    setPending(true);
    try {
      const data: ReceiptData = {
        storeName: receipt.storeName,
        orderCode: order.code,
        settings: s,
        customer,
        amount: cents,
        date,
        time,
        generatedAt: new Date(),
      };
      const { renderReceiptPdf } = await import("@/lib/receipt-pdf");
      await deliverPdf(await renderReceiptPdf(data), receiptFileName(order.code));
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o recibo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader className="shrink-0 px-[22px] pt-5 pb-3.5 text-left">
        <span className="block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Pedido #{order.code} · Pix
        </span>
        <DialogTitle className="text-[19px] font-bold">Gerar recibo</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          Confira os dados antes de baixar. Nada é alterado no pedido.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] pt-1.5 pb-5">
        {!configured && (
          <div role="alert" className="flex gap-3 rounded-xl border border-[#F0DCAE] bg-amber-wash p-[15px]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-white text-amber">
              <AlertTriangle className="size-[17px]" strokeWidth={2} aria-hidden />
            </span>
            <span className="flex-1 text-[#6E4E0E]">
              <span className="block text-[13.5px] font-bold">Faltam os dados do recibo</span>
              <span className="mt-0.5 block text-[12.5px] leading-[1.45]">
                Para, instituição e chave Pix são obrigatórios. Um administrador preenche em Configurações › Loja.
              </span>
              {receipt.canEditSettings && (
                <Link
                  href={settingsHref}
                  className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary"
                >
                  Abrir Configurações
                  <ChevronRight className="size-3.5" strokeWidth={2.2} aria-hidden />
                </Link>
              )}
            </span>
          </div>
        )}

        <div>
          <label htmlFor="receipt-customer" className={LABEL}>Cliente</label>
          <input
            id="receipt-customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            maxLength={80}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="receipt-amount" className={LABEL}>Valor</label>
          <div className="flex h-[46px] items-center gap-2 rounded-xl border border-border bg-paper px-3.5 focus-within:border-primary">
            <span className="text-[14px] font-semibold text-ink-faint">R$</span>
            <input
              id="receipt-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={cents === null}
              className="tabular h-full min-w-0 flex-1 bg-transparent text-[15px] font-bold text-ink outline-none"
            />
            {cents !== order.total && (
              <button
                type="button"
                onClick={() => setAmount(amountInput(order.total))}
                className="h-7 shrink-0 rounded-lg border border-[#DDEBD5] bg-white px-2.5 text-[11.5px] font-semibold text-primary"
              >
                Usar total
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-faint">
            {cents === null ? "Informe um valor maior que zero." : `Sugerido pelo total do pedido (${formatBRL(order.total)}).`}
          </p>
        </div>

        <div className="grid grid-cols-[1.4fr_1fr] gap-3">
          <div>
            <label htmlFor="receipt-date" className={LABEL}>Data</label>
            <input
              id="receipt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${FIELD} tabular`}
            />
          </div>
          <div>
            <label htmlFor="receipt-time" className={LABEL}>Horário</label>
            <input
              id="receipt-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${FIELD} tabular`}
            />
          </div>
        </div>

        {configured && (
          <div className="rounded-xl border border-[#E3EEDC] bg-mint-wash px-[15px] py-3.5">
            <div className="mb-2.5 flex items-center">
              <span className="flex-1 text-[11px] font-bold uppercase tracking-[.4px] text-ink-soft">
                Dados da loja no recibo
              </span>
              {receipt.canEditSettings && (
                <Link href={settingsHref} className="text-[12px] font-semibold text-primary">
                  Editar em Configurações
                </Link>
              )}
            </div>
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-[7px] text-[12.5px]">
              {fixedRows
                .filter(([, v]) => v?.trim())
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ink-faint">{label}</dt>
                    <dd className="min-w-0 break-words font-semibold text-ink">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </div>

      <DialogFooter className="m-0 shrink-0 flex-row gap-2.5 rounded-none border-t border-border bg-card px-[22px] py-4">
        <Button variant="outline" onClick={onClose} className="h-11 shrink-0 rounded-xl px-[18px]">
          Cancelar
        </Button>
        <Button
          onClick={download}
          disabled={pending || !configured || cents === null || !date || !time}
          className="h-11 flex-1 rounded-xl font-semibold"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {configured && cents !== null ? `Baixar PDF · ${formatBRL(cents)}` : "Baixar PDF"}
        </Button>
      </DialogFooter>
    </>
  );
}
