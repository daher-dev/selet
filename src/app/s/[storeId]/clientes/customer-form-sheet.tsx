"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker, MonthPicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TAG_CATALOG, maskPhone } from "./customer-logic";

interface CustomerFormSheetProps {
  storeId: string;
  storeName: string;
  defaultDDD?: string;
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerFormSheet({
  storeId,
  storeName,
  defaultDDD,
  customer,
  open,
  onOpenChange,
}: CustomerFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-wide text-leaf">
            {customer ? "Editar cadastro" : "Novo cadastro"}
          </p>
          <SheetTitle className="text-[19px] font-bold">
            {customer ? "Editar cliente" : "Novo cliente"}
          </SheetTitle>
        </SheetHeader>
        <CustomerForm
          key={customer?.id ?? "new"}
          storeId={storeId}
          storeName={storeName}
          defaultDDD={defaultDDD}
          customer={customer}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** A birthday {day,month} rendered as a Date (fixed reference year) for the calendar. */
function birthdayToDate(b: Customer["birthday"]): Date | undefined {
  return b ? new Date(2000, b.month - 1, b.day) : undefined;
}

/** ISO "since" → MonthPicker value {year, month(0-indexed)}. */
function sinceToMonth(iso: string): { year: number; month: number } | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function thisMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

function CustomerForm({
  storeId,
  storeName,
  defaultDDD,
  customer,
  onClose,
}: {
  storeId: string;
  storeName: string;
  defaultDDD?: string;
  customer: Customer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(
    customer ? maskPhone(customer.phone ?? "") : maskPhone(defaultDDD ?? ""),
  );
  const [instagram, setInstagram] = useState(customer?.instagram ?? "");
  const [birthday, setBirthday] = useState<Customer["birthday"]>(
    customer?.birthday,
  );
  const [since, setSince] = useState<{ year: number; month: number } | undefined>(
    customer ? sinceToMonth(customer.since) : thisMonth(),
  );
  const [tags, setTags] = useState<string[]>(customer?.tags ?? []);
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [archived, setArchived] = useState(customer?.archived ?? false);
  const [pending, startTransition] = useTransition();

  function toggleTag(id: string) {
    setTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  function submit() {
    startTransition(async () => {
      const input = {
        storeId,
        name,
        phone: phone || undefined,
        // City is derived from the active store on create (design 2401); on
        // edit we preserve whatever the customer already had.
        city: customer?.city ?? storeName ?? undefined,
        instagram: instagram || undefined,
        birthday,
        since: since
          ? new Date(Date.UTC(since.year, since.month, 1, 12)).toISOString()
          : undefined,
        tags,
        notes: notes || undefined,
        ...(customer ? { archived } : {}),
      };
      const result = customer
        ? await updateCustomerAction(customer.id, input)
        : await createCustomerAction(input);
      if (result.ok) {
        toast.success(customer ? "Cliente atualizado." : "Cliente criado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="customer-name">Nome</Label>
          <Input
            id="customer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ana Ribeiro"
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Telefone</Label>
            <Input
              id="customer-phone"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(27) 90000-0000"
              inputMode="numeric"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Aniversário</Label>
            <DatePicker
              value={birthdayToDate(birthday)}
              onChange={(d) =>
                setBirthday({ day: d.getDate(), month: d.getMonth() + 1 })
              }
              placeholder="Selecionar"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-instagram">Instagram</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-faint">
              @
            </span>
            <Input
              id="customer-instagram"
              value={instagram}
              onChange={(e) =>
                setInstagram(
                  e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""),
                )
              }
              placeholder="usuario"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="rounded-xl pl-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Cliente desde</Label>
          <MonthPicker
            value={since}
            onChange={setSince}
            placeholder="Selecionar"
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-2">
            {TAG_CATALOG.map((t) => {
              const on = tags.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition-all hover:-translate-y-0.5",
                    on
                      ? t.onClass
                      : "border-border bg-card text-ink-faint",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-notes">Anotações</Label>
          <Textarea
            id="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Preferências, restrições, observações…"
            rows={3}
            className="rounded-xl"
          />
        </div>

        {customer && (
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
              archived
                ? "border-[#7A857D]/40 bg-[#EEF1ED]"
                : "border-border bg-card hover:bg-surface",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                archived ? "bg-[#7A857D] text-white" : "bg-[#EEF1ED] text-[#7A857D]",
              )}
            >
              <Archive className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                {archived ? "Cliente arquivado" : "Arquivar cliente"}
              </span>
              <span className="block text-[11.5px] text-ink-faint">
                Some da lista sem apagar o histórico.
              </span>
            </span>
          </button>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="flex-[1.6] rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {customer ? "Salvar alterações" : "Criar cliente"}
        </Button>
      </SheetFooter>
    </>
  );
}
