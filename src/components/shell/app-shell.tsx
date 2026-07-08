"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser, Store } from "@/lib/types";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "./sidebar-content";
import { ShellHeader } from "./shell-header";
import { AppShellProvider } from "./app-shell-context";

/** Live nav counters computed cheaply in the layout server component. */
export interface NavBadges {
  openOrders: number;
  lowStock: number;
}

interface AppShellProps {
  user: SessionUser;
  store: Store;
  stores: Store[];
  badges: NavBadges;
  children: React.ReactNode;
}

export function AppShell({
  user,
  store,
  stores,
  badges,
  children,
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <AppShellProvider routeKey={pathname}>
      <div className="flex h-dvh w-full overflow-hidden">
        {/* Desktop sidebar (≥820px) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-border bg-white px-4 py-[22px] min-[820px]:block">
          <SidebarContent
            user={user}
            store={store}
            stores={stores}
            badges={badges}
          />
        </aside>

        {/* Mobile slide-in nav drawer (<820px), green-tinted scrim */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            overlayClassName="bg-[rgba(21,35,28,0.4)] supports-backdrop-filter:backdrop-blur-none"
            className="w-[266px] max-w-[266px] border-border bg-white px-4 py-[18px] min-[820px]:hidden"
          >
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <SidebarContent
              user={user}
              store={store}
              stores={stores}
              badges={badges}
              onNavigate={() => setNavOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Main column: persistent header + scrollable content */}
        <div className="flex min-w-0 flex-1 flex-col min-[820px]:pl-[248px]">
          <ShellHeader store={store} onOpenNav={() => setNavOpen(true)} />
          <main className="flex-1 overflow-y-auto px-3.5 pb-[72px] pt-4 min-[820px]:px-7 min-[820px]:pb-10 min-[820px]:pt-[26px]">
            {children}
          </main>
        </div>
      </div>
    </AppShellProvider>
  );
}
