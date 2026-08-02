"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MobileNav({ tabs, active }: {
  tabs: { id: string; href: string; label: string }[];
  active: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:hidden"
        aria-label="Abrir navegação"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {tabs.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={t.href} className={active === t.id ? "font-semibold text-brand-700" : ""}>
              {t.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
