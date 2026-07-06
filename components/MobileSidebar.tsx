"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/SidebarNav";

// Drawer de navegação no mobile: reusa a mesma SidebarNav do desktop.
export function MobileSidebar({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:hidden dark:hover:bg-slate-800"
        aria-label="Abrir navegação"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="left-0 right-auto w-64 max-w-[80vw] p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <SheetTitle className="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">CRM AI Studio</SheetTitle>
          <SidebarNav canManage={canManage} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
