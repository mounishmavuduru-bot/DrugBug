"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Pill,
  ScanLine,
  Network,
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
  primary?: boolean; // shown in mobile bottom bar
}

export const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: CalendarCheck, primary: true },
  { href: "/meds", label: "Meds", icon: Pill, primary: true },
  { href: "/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/cascade", label: "Cascade", icon: Network, primary: true },
  { href: "/insights", label: "Insights", icon: LineChart, primary: true },
  { href: "/pharmacofit", label: "PharmacoFit", icon: Dna },
  { href: "/caregiver", label: "Caregiver", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Desktop left sidebar (md+). */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Pill className="size-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">DrugBug</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-fast",
                active ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile bottom tab bar (below md). */
export function BottomBar() {
  const pathname = usePathname();
  const items = NAV.filter((i) => i.primary);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/95 backdrop-blur md:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] transition-fast",
              active ? "text-primary" : "text-muted"
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
