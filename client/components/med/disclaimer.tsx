import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Decision-support disclaimer required on every clinical-adjacent output
 * (PRD §5/§16/§18). Renders the mandated copy verbatim.
 */
export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-snug text-muted", className)}>
      <Info className="mt-px size-3 shrink-0" aria-hidden />
      <span>Decision-support — confirm with your pharmacist or prescriber.</span>
    </p>
  );
}
