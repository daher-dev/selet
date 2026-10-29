import { Badge } from "@/components/ui/badge";

/** Marks an INTERNO customer / order (team and friends of the house: comped, off the reports). */
export function InternalBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={className}>
      Interno
    </Badge>
  );
}
