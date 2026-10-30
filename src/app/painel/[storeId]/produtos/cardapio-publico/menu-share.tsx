"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { MenuQr } from "@/components/menu/menu-view";
import { SeletLeaf } from "@/components/shell/selet-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qrPath } from "@/lib/qr";

/**
 * Prints only `children`: they render into a body-level node and every other
 * body child is hidden for the print. Unmounts after the print dialog closes.
 */
export function PrintPortal({ children, onDone }: { children: React.ReactNode; onDone: () => void }) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const done = () => doneRef.current();
    window.addEventListener("afterprint", done);
    // Let fonts and the QR paint before opening the dialog.
    const t = setTimeout(() => document.fonts.ready.then(() => window.print()), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, []);
  // Only mounted after a click, so document exists.
  return createPortal(
    <div id="menu-print">
      <style>{`@media screen{#menu-print{display:none}}@media print{body>*:not(#menu-print){display:none!important}}`}</style>
      {children}
    </div>,
    document.body,
  );
}

function downloadPng(url: string, filename: string) {
  const { size, d } = qrPath(url);
  const scale = 24;
  const pad = 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = (size + pad * 2) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
  ctx.fillStyle = "#15231C";
  ctx.fill(new Path2D(d));
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

export function SharePanel({
  open,
  onOpenChange,
  url,
  storeName,
  published,
  onPrintPosters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  storeName: string;
  published: boolean;
  onPrintPosters: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não deu para copiar. Selecione o link e copie.");
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
        <DialogHeader className="px-5 pb-1 pt-5">
          <DialogTitle className="text-[17px] font-bold">Link e QR code</DialogTitle>
          <DialogDescription>O mesmo endereço sempre: ao publicar uma nova versão, quem escanear já vê ela.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4">
          {!published && (
            <div className="mb-4 flex gap-2 rounded-xl bg-amber-wash px-3 py-2.5 text-[12.5px] font-medium text-amber">
              <TriangleAlert className="mt-px size-4 shrink-0" />
              O link só abre para clientes depois que você publicar o cardápio.
            </div>
          )}
          <div className="mx-auto w-fit rounded-2xl border border-[#E7EEE6] bg-white p-3">
            <MenuQr url={url} className="size-[200px]" />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E7EEE6] bg-paper py-1 pl-3 pr-1">
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-soft">{url}</span>
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copiar link">
              {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir como cliente">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => downloadPng(url, `qr-cardapio-${storeName || "selet"}.png`)} className="h-10 rounded-[10px] text-[13px] font-semibold">
              <Download className="size-3.5" />
              Baixar PNG
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onPrintPosters();
              }}
              className="h-10 rounded-[10px] text-[13px] font-semibold"
            >
              <Printer className="size-3.5" />
              Cartazes de mesa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One A4 with four A6 table cards and cut marks. */
export function TablePosters({ url, storeName }: { url: string; storeName: string }) {
  return (
    <div className="grid h-[296mm] w-[210mm] grid-cols-2 grid-rows-2 bg-white font-sans text-ink [print-color-adjust:exact]">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col items-center justify-center border-dashed border-[#C8C2B2] p-[10mm] text-center [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r">
          <div className="flex items-center gap-2 text-primary">
            <SeletLeaf className="size-5" />
            <span className="font-display text-[22px] font-semibold leading-none">Selet</span>
          </div>
          <div className="mt-3 font-display text-[30px] font-semibold leading-tight">Nosso cardápio</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[2px] text-ink-faint">{storeName}</div>
          <div className="mt-4 rounded-2xl border-[5px] border-primary bg-white p-2">
            <MenuQr url={url} className="size-[42mm]" />
          </div>
          <p className="mt-3.5 text-[12px] text-ink-soft">Aponte a câmera do celular</p>
          <p className="font-mono text-[9.5px] text-ink-faint">{url.replace(/^https?:\/\//, "")}</p>
        </div>
      ))}
    </div>
  );
}
