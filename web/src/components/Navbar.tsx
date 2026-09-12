"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PixelWizard from "@/components/PixelWizard";

const LINKS = [
  { href: "/", label: "Vault" },
  { href: "/attempts", label: "Attempts" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b-2 border-[color:var(--panel-light)] bg-[color:var(--ink)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <PixelWizard size={32} float={false} />
          <span className="font-pixel text-[9px] leading-relaxed text-[color:var(--gold)] sm:text-xs">
            THE WIZARD&apos;S COIN
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-lg">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${
                  active
                    ? "bg-[color:var(--panel-light)] text-[color:var(--cyan)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {active ? `▸${link.label}` : link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
