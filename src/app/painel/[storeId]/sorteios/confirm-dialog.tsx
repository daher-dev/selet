"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const TONE = {
  primary: "bg-primary text-white",
  amber: "bg-[#8A5A0F] text-white",
  danger: "bg-[#B23A22] text-white",
} as const;

/** Confirmation dialogs of board 12c (Publicar / Encerrar / Excluir). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  cta,
  tone = "primary",
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  text: string;
  cta: string;
  tone?: keyof typeof TONE;
  pending?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-bold">{title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            {text}
          </DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="mt-5 flex-row justify-end gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[42px] rounded-[10px] border border-border bg-white px-4 text-[13px] font-semibold text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "flex h-[42px] items-center gap-2 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-70",
              TONE[tone],
            )}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {cta}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
