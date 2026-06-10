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

/** Wordmark — capsule mark + name set in the editorial display serif. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/today" className={cn("flex items-center gap-2", className)} aria-label="DrugBug home">
      <svg width="22" height="22" viewBox="0 0 512 512" aria-hidden="true">
        <g transform="translate(256 256) rotate(-38)">
          <rect x="-150" y="-70" width="300" height="140" rx="70" fill="#15402e" />
          <path d="M -150 0 a 70 70 0 0 1 70 -70 L 0 -70 L 0 70 L -80 70 a 70 70 0 0 1 -70 -70 Z" fill="#fbf8f0" />
          <line x1="0" y1="-70" x2="0" y2="70" stroke="#15402e" strokeWidth="9" />
        </g>
      </svg>
      <span className="font-display text-xl tracking-tight text-ink">DrugBug</span>
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
