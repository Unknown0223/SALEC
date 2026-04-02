"use client";

import { Input } from "@/components/ui/input";
import { resolveSettingsItemHref, settingsSections } from "@/lib/settings-structure";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function stripHash(href: string): string {
  const idx = href.indexOf("#");
  return idx >= 0 ? href.slice(0, idx) : href;
}

export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border border-border/80 bg-card/80 p-3 shadow-sm">
        <div className="mb-3">
          <Input placeholder="Поиск" disabled />
        </div>
        <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
          {settingsSections.map((section) => (
            <section key={section.slug}>
              <p className="mb-1.5 text-sm font-semibold">{section.title}</p>
              <ul className="space-y-0.5 text-sm">
                {section.items.map((item) => {
                  const href = resolveSettingsItemHref(item);
                  const active = pathname === stripHash(href) || pathname.startsWith(`${stripHash(href)}/`);
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        className={cn(
                          "block rounded px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                          active && "bg-muted text-foreground"
                        )}
                      >
                        • {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </aside>

      <div>{children}</div>
    </div>
  );
}
