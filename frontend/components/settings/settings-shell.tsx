"use client";

import { Input } from "@/components/ui/input";
import type { SettingsItem } from "@/lib/settings-structure";
import { resolveSettingsItemHref, settingsSections } from "@/lib/settings-structure";
import { useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

function stripHash(href: string): string {
  const idx = href.indexOf("#");
  return idx >= 0 ? href.slice(0, idx) : href;
}

function isItemActive(pathname: string, href: string): boolean {
  const base = stripHash(href);
  if (pathname === base) return true;
  return pathname.startsWith(`${base}/`);
}

function filterSettingsItem(item: SettingsItem, q: string): SettingsItem | null {
  if (!q) return item;
  const qq = q.toLowerCase();
  if (item.children?.length) {
    if (item.title.toLowerCase().includes(qq)) return item;
    const kids = item.children.filter((c) => c.title.toLowerCase().includes(qq));
    if (kids.length) return { ...item, children: kids };
    return null;
  }
  return item.title.toLowerCase().includes(qq) ? item : null;
}

/** Asosiy yon paneldagi «Пользователи» → bu sahifalarda sozlamalar ikkinchi paneli kerak emas */
export function isUsersStaffSpravochnikPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  const prefixes = [
    "/settings/spravochnik/agents",
    "/settings/spravochnik/expeditors",
    "/settings/spravochnik/supervisors"
  ];
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideSettingsAside = isUsersStaffSpravochnikPath(pathname);
  const role = useEffectiveRole();
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of settingsSections) {
        for (const item of section.items) {
          if (!item.children?.length) continue;
          const anyActive = item.children.some((c) =>
            isItemActive(pathname, resolveSettingsItemHref(c))
          );
          if (anyActive) next[item.slug] = true;
        }
      }
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of settingsSections) {
        for (const item of section.items) {
          if (!item.children?.length) continue;
          const matched = filterSettingsItem(item, q);
          if (matched?.children?.length) next[item.slug] = true;
        }
      }
      return next;
    });
  }, [search]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    let sections = settingsSections;
    if (role !== "admin") {
      sections = sections
        .map((section) => (section.slug === "sistema" ? { ...section, items: [] } : section))
        .filter((s) => s.items.length > 0);
    }
    if (!q) return sections;
    return sections
      .map((section) => {
        const sectionMatch = section.title.toLowerCase().includes(q);
        const items = section.items
          .map((item) => (sectionMatch ? item : filterSettingsItem(item, q)))
          .filter((item): item is SettingsItem => item != null);
        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [search, role]);

  if (hideSettingsAside) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-border/80 bg-card md:w-[min(100%,300px)] md:shrink-0",
          "max-h-[min(40vh,320px)] border-b md:max-h-none md:border-b-0 md:border-r"
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3 md:px-4">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sozlamalar</p>
            <Link
              href="/dashboard"
              className="text-[11px] text-primary underline-offset-4 hover:underline md:text-xs"
            >
              ← Panel
            </Link>
          </div>
          <Input
            placeholder="Поиск"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
            aria-label="Sozlamalar bo‘yicha qidiruv"
          />
        </div>
        <nav
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 md:px-3 md:py-3"
          aria-label="Sozlamalar ichki menyu"
        >
          {filteredSections.map((section) => (
            <section key={section.slug} className="mb-4 last:mb-2">
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-0.5 text-sm">
                {section.items.map((item) => {
                  if (item.children?.length) {
                    const open = openGroups[item.slug] ?? false;
                    const groupChildActive = item.children.some((c) =>
                      isItemActive(pathname, resolveSettingsItemHref(c))
                    );
                    return (
                      <li key={item.slug} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((prev) => ({ ...prev, [item.slug]: !open }))
                          }
                          className={cn(
                            "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                            groupChildActive && "font-medium text-foreground"
                          )}
                          aria-expanded={open}
                        >
                          {open ? (
                            <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4 shrink-0 opacity-70" aria-hidden />
                          )}
                          <span>{item.title}</span>
                        </button>
                        {open && (
                          <ul className="ml-1 space-y-0.5 border-l border-border/70 py-0.5 pl-2">
                            {item.children.map((child) => {
                              const chref = resolveSettingsItemHref(child);
                              const childActive = isItemActive(pathname, chref);
                              return (
                                <li key={child.slug}>
                                  <Link
                                    href={chref}
                                    className={cn(
                                      "block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                      childActive && "bg-primary/15 font-medium text-foreground"
                                    )}
                                  >
                                    {child.title}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  const href = resolveSettingsItemHref(item);
                  const active = isItemActive(pathname, href);
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                          active && "bg-primary/15 font-medium text-foreground"
                        )}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-5 md:px-6 md:py-6">
        {children}
      </main>
    </div>
  );
}
