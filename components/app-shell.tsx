"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useCreator } from "@/components/creator-provider";
import LogoutButton from "@/components/logout-button";

const groups = [
  { label: "Workspace", items: [["⌂", "Dashboard", "/dashboard"], ["▤", "Content", "/dashboard/content"], ["✦", "Ideas", "/dashboard/ideas"], ["□", "Calendar", "/dashboard/calendar"], ["↗", "Analytics", "/dashboard/analytics"]] },
  { label: "Creator tools", items: [["✎", "Studio", "/dashboard/studio"], ["◌", "Analyzer", "/dashboard/analyzer"], ["✧", "AI Coach", "/dashboard/coach"]] },
  { label: "Account", items: [["⚙", "Settings", "/dashboard/settings"], ["♧", "Connected Accounts", "/dashboard/settings/connections"], ["▣", "Billing", "/dashboard/billing"]] },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile } = useCreator();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = profile.displayName || "Creator";
  const active = (href: string) => href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  return <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-[var(--border)] bg-[var(--surface)] px-5 py-6 lg:flex lg:flex-col">
      <Link href="/dashboard" className="flex items-center gap-3 px-2 text-lg font-extrabold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--purple)] text-white">C</span>Contentra</Link>
      <nav className="mt-10 flex-1 space-y-7" aria-label="Primary navigation">{groups.map(group => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--faint)]">{group.label}</p><div className="space-y-1">{group.items.map(([icon, label, href]) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${active(href) ? "bg-[var(--accent-soft)] text-[var(--purple-light)]" : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"}`}><span className="w-5 text-center text-base">{icon}</span>{label}</Link>)}</div></div>)}</nav>
      <div className="border-t border-[var(--border)] pt-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--purple-light)]">{(profile.avatar || name).slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{name}</p><p className="truncate text-xs text-[var(--muted)]">@{profile.username || "creator"}</p></div><button aria-label="Open account menu" onClick={() => setMenuOpen(!menuOpen)} className="ml-auto text-[var(--muted)]">•••</button></div>{menuOpen && <div className="mt-3 space-y-1 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 text-sm"><Link className="block rounded-lg px-3 py-2 hover:bg-[var(--accent-soft)]" href="/dashboard/settings/profile">Profile</Link><LogoutButton /></div>}</div>
    </aside>
    <main className="min-w-0 lg:pl-64">{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--border)] bg-white/95 px-2 py-2 backdrop-blur lg:hidden" aria-label="Mobile navigation">{[["⌂", "Home", "/dashboard"], ["▤", "Content", "/dashboard/content"], ["✦", "Ideas", "/dashboard/ideas"], ["□", "Calendar", "/dashboard/calendar"], ["⚙", "More", "/dashboard/settings"]].map(([icon, label, href]) => <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold ${active(href) ? "text-[var(--purple-light)]" : "text-[var(--muted)]"}`}><span className="text-base">{icon}</span>{label}</Link>)}</nav>
  </div>;
}
