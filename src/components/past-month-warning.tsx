import { TriangleAlert } from "lucide-react";
import { monthLabel } from "@/lib/past-month";

/** Amber notice shown before a change that moves money in an already-passed month. */
export function PastMonthWarning({ months, action }: { months: string[]; action: string }) {
  const uniq = [...new Set(months)].sort();
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-xl border border-[#f0e4c8] bg-amber-wash p-3 text-[12.5px] text-amber"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <p>
        <strong className="font-bold">Mês anterior.</strong> {action} afeta as Entradas de{" "}
        {uniq.map(monthLabel).join(" e ")}, que já passou e pode estar fechado. A mudança fica registrada
        no histórico.
      </p>
    </div>
  );
}
