"use client";

import { useState } from "react";
import type { Customer, Product, Voucher, VoucherTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePageAction } from "@/components/shell/app-shell-context";
import { SoldList } from "./sold-list";
import { TemplatesList } from "./templates-list";
import { TemplateSheet } from "./template-sheet";
import { VoucherSellSheet } from "./voucher-sell-sheet";

type Tab = "vendidos" | "modelos";

interface VouchersClientProps {
  storeId: string;
  vouchers: Voucher[];
  templates: VoucherTemplate[];
  customers: Customer[];
  products: Product[];
}

export function VouchersClient({
  storeId,
  vouchers,
  templates,
  customers,
  products,
}: VouchersClientProps) {
  const [tab, setTab] = useState<Tab>("vendidos");
  const [selling, setSelling] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<VoucherTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  usePageAction({
    label: tab === "vendidos" ? "Vender voucher" : "Novo modelo",
    onClick: () =>
      tab === "vendidos" ? setSelling(true) : setCreatingTemplate(true),
  });

  return (
    <>
      <div className="mb-4 inline-flex items-center gap-0.5 rounded-xl bg-wash p-1">
        {(
          [
            { key: "vendidos", label: "Vendidos" },
            { key: "modelos", label: "Modelos" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors",
              tab === t.key
                ? "bg-white text-ink shadow-sm"
                : "text-ink-faint hover:text-ink-soft",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vendidos" ? (
        <SoldList
          storeId={storeId}
          vouchers={vouchers}
          onSell={() => setSelling(true)}
        />
      ) : (
        <TemplatesList
          storeId={storeId}
          templates={templates}
          onCreate={() => setCreatingTemplate(true)}
          onEdit={(t) => setEditingTemplate(t)}
        />
      )}

      <VoucherSellSheet
        storeId={storeId}
        templates={templates.filter((t) => t.active)}
        customers={customers}
        open={selling}
        onOpenChange={setSelling}
      />

      <TemplateSheet
        storeId={storeId}
        template={creatingTemplate ? null : editingTemplate}
        products={products}
        open={creatingTemplate || editingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatingTemplate(false);
            setEditingTemplate(null);
          }
        }}
      />
    </>
  );
}
