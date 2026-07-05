"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { SessionUser, Store } from "@/lib/types";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./sidebar-content";
import { SeletMark, SeletWordmark } from "./selet-mark";

interface AppShellProps {
  user: SessionUser;
  store: Store;
  stores: Store[];
  children: React.ReactNode;
}

export function AppShell({ user, store, stores, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh w-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-sidebar-border lg:block">
        <SidebarContent user={user} store={store} stores={stores} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[248px]">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-border bg-paper/90 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Abrir menu"
                className="-ml-2 text-ink"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[266px] p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarContent
                user={user}
                store={store}
                stores={stores}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <SeletMark className="size-7" />
            <SeletWordmark className="text-[20px]" />
          </div>
        </header>

        <main className="flex-1 px-4 py-4 lg:px-7 lg:py-6">{children}</main>
      </div>
    </div>
  );
}
