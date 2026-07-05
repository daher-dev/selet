"use client";

import { useState, useTransition } from "react";
import { Crown, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CustomerFormSheetProps {
  storeId: string;
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerFormSheet({
  storeId,
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
          <SheetTitle className="text-[17px] font-bold">
            {customer ? "Editar cliente" : "Novo cliente"}
          </SheetTitle>
        </SheetHeader>
        <CustomerForm
          key={customer?.id ?? "new"}
          storeId={storeId}
          customer={customer}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function CustomerForm({
  storeId,
  customer,
  onClose,
}: {
  storeId: string;
  customer: Customer | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [instagram, setInstagram] = useState(customer?.instagram ?? "");
  const [birthDay, setBirthDay] = useState<string>(
    customer?.birthday ? String(customer.birthday.day) : "",
  );
  const [birthMonth, setBirthMonth] = useState<string>(
    customer?.birthday ? String(customer.birthday.month) : "",
  );
  const [since, setSince] = useState(
    customer?.since ? customer.since.slice(0, 10) : "",
  );
  const [vip, setVip] = useState(customer?.tags.includes("vip") ?? false);
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    const birthday =
      birthDay && birthMonth
        ? { day: Number(birthDay), month: Number(birthMonth) }
        : undefined;

    startTransition(async () => {
      const input = {
        storeId,
        name,
        phone: phone || undefined,
        city: city || undefined,
        instagram: instagram || undefined,
        birthday,
        since: since ? new Date(`${since}T12:00:00Z`).toISOString() : undefined,
        tags: vip ? ["vip"] : [],
        notes: notes || undefined,
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
            placeholder="Maria Silva"
            className="rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Telefone</Label>
            <Input
              id="customer-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(27) 99999-0000"
              inputMode="tel"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-city">Cidade</Label>
            <Input
              id="customer-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Vila Velha/ES"
              className="rounded-xl"
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
              onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
              placeholder="maria.silva"
              className="rounded-xl pl-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Aniversário</Label>
            <div className="flex gap-2">
              <Input
                value={birthDay}
                onChange={(e) =>
                  setBirthDay(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="Dia"
                inputMode="numeric"
                className="w-16 rounded-xl text-center"
              />
              <Select value={birthMonth} onValueChange={setBirthMonth}>
                <SelectTrigger className="flex-1 rounded-xl">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-since">Cliente desde</Label>
            <Input
              id="customer-since"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setVip(!vip)}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 transition-colors",
            vip ? "border-amber bg-amber-wash" : "border-border bg-paper",
          )}
        >
          <span className="flex items-center gap-2.5">
            <Crown className={cn("size-4", vip ? "text-amber" : "text-ink-faint")} />
            <span className="text-left">
              <span className="block text-[13px] font-semibold text-ink">
                Cliente VIP
              </span>
              <span className="block text-[11.5px] text-ink-faint">
                Destaque na lista e no atendimento.
              </span>
            </span>
          </span>
          <span
            className={cn(
              "text-[11px] font-bold uppercase",
              vip ? "text-amber" : "text-ink-faint",
            )}
          >
            {vip ? "Sim" : "Não"}
          </span>
        </button>

        <div className="space-y-1.5">
          <Label htmlFor="customer-notes">Notas</Label>
          <Textarea
            id="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Preferências, restrições, contexto…"
            rows={3}
            className="rounded-xl"
          />
        </div>
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
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </SheetFooter>
    </>
  );
}
