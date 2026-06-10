"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Pill,
  ScanLine,
  Share2,
  LineChart,
  Dna,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean; // shown in the mobile tab bar
}

export const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: CalendarCheck, primary: true },
  { href: "/meds", label: "Medications", icon: Pill, primary: true },
  { href: "/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/cascade", label: "Interactions", icon: Share2, primary: true },
  { href: "/insights", label: "Insights", icon: LineChart, primary: true },
  { href: "/pharmacofit", label: "Pharmacogenomics", icon: Dna },
  { href: "/caregiver", label: "Caregivers", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Wordmark — the pill-bug mark + name set in Poppins. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/today" className={cn("flex items-center gap-2", className)} aria-label="DrugBug home">
      <svg width="26" height="26" viewBox="0 0 512 512" aria-hidden="true">
        <clipPath id="wm-cap"><rect x="206" y="164" width="100" height="266" rx="50" /></clipPath>
        <path d="M210 252 C 156 244 126 300 150 348 C 164 376 196 366 214 326 Z" fill="#272624" />
        <path d="M302 252 C 356 244 386 300 362 348 C 348 376 316 366 298 326 Z" fill="#272624" />
        <path d="M232 172 C 214 122 212 98 226 82" fill="none" stroke="#272624" strokeWidth="22" strokeLinecap="round" />
        <path d="M280 172 C 298 122 300 98 286 82" fill="none" stroke="#272624" strokeWidth="22" strokeLinecap="round" />
        <g clipPath="url(#wm-cap)"><rect x="206" y="164" width="100" height="140" fill="#9b1e4d" /></g>
        <rect x="198" y="156" width="116" height="282" rx="58" fill="none" stroke="#272624" strokeWidth="22" />
        <line x1="208" y1="300" x2="304" y2="300" stroke="#272624" strokeWidth="18" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">DrugBug</span>
    </Link>
  );
}

/** Desktop left ledger (md+). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-rule bg-surface md:flex">
      <div className="px-5 py-5">
        <Wordmark />
      </div>
      <nav className="flex flex-1 flex-col px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-brand-tint font-medium text-brand"
                  : "text-muted hover:bg-brand-tint/60 hover:text-ink"
              )}
            >
              <item.icon className="size-4" strokeWidth={active ? 2.1 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="px-5 py-4 text-[11px] leading-relaxed text-faint">
        Decision support, not a diagnosis. Confirm with your pharmacist or prescriber.
      </p>
    </aside>
  );
}

/** Mobile bottom tab bar (below md). */
export function BottomBar() {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.primary);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-rule bg-surface md:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors duration-150",
              active ? "text-brand" : "text-faint"
            )}
          >
            <item.icon className="size-5" strokeWidth={active ? 2.1 : 1.8} />
            {item.label === "Medications" ? "Meds" : item.label === "Interactions" ? "Interact" : item.label}
          </Link>
        );
      })}
    </nav>
  );
}
