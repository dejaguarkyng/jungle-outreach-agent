"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  MessagesSquare,
  LayoutDashboard,
  Mail,
  Play,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospects", label: "Prospects", icon: Users },
  { href: "/research", label: "Research review", icon: Search },
  { href: "/drafts", label: "Drafts", icon: Mail },
  { href: "/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/run", label: "Manual run", icon: Play },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="border-b bg-black/25 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="overflow-hidden rounded-lg bg-white">
            <Image src="/openline-logo.png" alt="Openline" width={32} height={32} priority />
          </div>
          <div>
            <p className="text-sm font-semibold">Openline</p>
            <p className="text-xs text-muted-foreground">Prospect intelligence</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  active && "bg-white/7 text-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-green-300")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden border-t p-4 text-xs text-muted-foreground lg:absolute lg:bottom-0 lg:block lg:w-full">
          <p className="flex items-center gap-2 text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Policy-controlled outreach
          </p>
          <p className="mt-1">Managed jobs, approvals, limits, and opt-outs.</p>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
