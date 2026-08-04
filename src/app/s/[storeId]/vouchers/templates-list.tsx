"use client";

import { useTransition } from "react";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import type { VoucherTemplate } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { computeSavings } from "@/lib/vouchers";
import { cn } from "@/lib/utils";
import { setVoucherTemplateActiveAction } from "@/actions/vouchers";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface TemplatesListProps {
  storeId: string;
  templates: VoucherTemplate[];
  onCreate: () => void;
  onEdit: (template: VoucherTemplate) => void;
}

export function TemplatesList({
  storeId,
  templates,
  onCreate,
  onEdit,
}: TemplatesListProps) {
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Nenhum modelo de voucher ainda"
        description="Crie um pacote (ex.: 5 shakes por um preço fechado) para começar a vender vouchers."
        action={
          <Button onClick={onCreate} className="rounded-xl font-semibold">
            Novo modelo
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {templates.map((t) => (
        <TemplateCard
          key={t.id}
          storeId={storeId}
          template={t}
          onEdit={() => onEdit(t)}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  storeId,
  template,
  onEdit,
}: {
  storeId: string;
  template: VoucherTemplate;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { savings } = computeSavings(template.items, template.packagePrice);

  function toggleActive(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      const result = await setVoucherTemplateActiveAction({
        storeId,
        templateId: template.id,
        active: !template.active,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    // A plain div, not <button> — the card contains its own nested "Reativar"
    // button, and <button> can't contain <button> (invalid HTML / hydration
    // error). Mirrors DataListRow's whole-row-clickable convention.
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "cursor-pointer rounded-2xl border p-4 text-left transition-colors",
        template.active
          ? "border-border bg-card hover:border-primary/40"
          : "border-dashed border-border/70 bg-paper opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-[14.5px] font-bold text-ink">
            {template.name}
          </span>
          {template.description && (
            <span className="mt-0.5 block text-[12px] text-ink-faint">
              {template.description}
            </span>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            template.active
              ? "bg-mint-wash text-primary"
              : "bg-wash text-ink-faint",
          )}
        >
          {template.active ? "Ativo" : "Desativado"}
        </span>
      </div>

      <ul className="mt-3 space-y-1">
        {template.items.map((i) => (
          <li key={i.productId} className="text-[12.5px] text-ink-soft">
            {i.name} × {i.qty}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-end justify-between border-t border-wash pt-3">
        <div>
          <span className="tabular block text-[16px] font-bold text-primary">
            {formatBRL(template.packagePrice)}
          </span>
          {savings > 0 && (
            <span className="text-[11px] text-ink-faint">
              · {formatBRL(savings)} de economia
            </span>
          )}
        </div>
        {template.active ? (
          <span className="text-[11.5px] font-semibold text-ink-faint">
            {template.validityDays ? `Vale ${template.validityDays} dias` : "Sem validade"}
          </span>
        ) : (
          <Button
            variant="link"
            size="sm"
            onClick={toggleActive}
            disabled={pending}
            className="h-auto p-0 text-[12px] font-semibold text-primary"
          >
            Reativar
          </Button>
        )}
      </div>
    </div>
  );
}
