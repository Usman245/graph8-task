"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/guard", label: "Quote Guard" },
  { href: "/deals", label: "Deals", also: ["/reviews"] },
  { href: "/delivery", label: "Delivery" },
  { href: "/settings", label: "Connection" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = [l.href, ...(l.also ?? [])].some((p) => path === p || path.startsWith(`${p}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${
              active ? "bg-foreground text-white" : "text-muted hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
