"use client";

import { Input } from "@/components/ui/input";
import type { SettingsItem } from "@/lib/settings-structure";
import {
  filterSettingsSectionsByRole,
  resolveSettingsItemHref,
  settingsSections
} from "@/lib/settings-structure";
import { useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

function stripHash(href: string): string {
  const idx = href.indexOf("#");
  return idx >= 0 ? href.slice(0, idx) : href;
}

function parseHrefPathAndQuery(href: string): { path: string; query: URLSearchParams } {
  const raw = stripHash(href);
  const q = raw.indexOf("?");
  if (q < 0) return { path: raw, query: new URLSearchParams() };
  return { path: raw.slice(0, q), query: new URLSearchParams(raw.slice(q + 1)) };
}

/** Joriy URL va havola (ichida ?tab= bo‘lishi mumkin) bo‘yicha aktiv yorliq. */
function isItemActive(pathname: string, currentSearch: string, href: string): boolean {
  const { path: hPath, query: hQuery } = parseHrefPathAndQuery(href);
  if (pathname !== hPath) {
    return pathname.startsWith(`${hPath}/`);
  }
  const cur = new URLSearchParams(currentSearch.replace(/^\?/, ""));
  if (Array.from(hQuery.keys()).length === 0) {
    if (hPath === "/settings/products") {
      const tab = cur.get("tab");
      return !tab || tab === "items";
    }
    return true;
  }
  for (const [k, v] of Array.from(hQuery.entries())) {
    if (cur.get(k) !== v) return false;
  }
  return true;
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

/**
 * Spravochnik — o‘zining navigatsiyasi; umumiy sozlamalar yon paneli kerak emas.
 */
export function isSettingsSpravochnikBranchPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path === "/settings/spravochnik" || path.startsWith("/settings/spravochnik/");
}

function normalizeSettingsPathname(pathname: string): string {
  const p = pathname.split("?")[0] ?? "";
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

/**
 * Ikkinchi «Sozlamalar» paneli — barcha sozlamalar ichki sahifalarida ochiq qoladi
 * (territoriya, kassalar, narxlar va h.k.); spravochnik filiali o‘z navigatsiyasi bilan — panel yo‘q.
 */
export function shouldShowSettingsSecondaryAside(pathname: string): boolean {
  const path = normalizeSettingsPathname(pathname);
  if (isSettingsSpravochnikBranchPath(pathname)) return false;
  /** Kassalar — asosiy yon paneldagi havola; ikkinchi sozlamalar paneli kerak emas */
  if (path === "/settings/cash-desks" || path.startsWith("/settings/cash-desks/")) return false;
  return path === "/settings" || path.startsWith("/settings/");
}

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const hideSettingsAside = !shouldShowSettingsSecondaryAside(pathname);
  const role = useEffectiveRole();
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const roleFilteredSections = useMemo(
    () => filterSettingsSectionsByRole(settingsSections, role),
    [role]
  );

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of roleFilteredSections) {
        for (const item of section.items) {
          if (!item.children?.length) continue;
          const anyActive = item.children.some((c) =>
            isItemActive(pathname, currentSearch, resolveSettingsItemHref(c))
          );
          if (anyActive) next[item.slug] = true;
        }
      }
      return next;
    });
  }, [pathname, currentSearch, roleFilteredSections]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of roleFilteredSections) {
        for (const item of section.items) {
          if (!item.children?.length) continue;
          const matched = filterSettingsItem(item, q);
          if (matched?.children?.length) next[item.slug] = true;
        }
      }
      return next;
    });
  }, [search, roleFilteredSections]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roleFilteredSections;
    return roleFilteredSections
      .map((section) => {
        const sectionMatch = section.title.toLowerCase().includes(q);
        const items = section.items
          .map((item) => (sectionMatch ? item : filterSettingsItem(item, q)))
          .filter((item): item is SettingsItem => item != null);
        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [search, roleFilteredSections]);

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
            <p className="text-sm font-bold text-foreground">Настройки</p>
            <Link
              href="/dashboard"
              className="text-[11px] text-primary underline-offset-4 hover:underline md:text-xs"
            >
              ← Дашборд
            </Link>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Поиск"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
              aria-label="Поиск в настройках"
            />
          </div>
        </div>
        <nav
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 md:px-3 md:py-3"
          aria-label="Внутреннее меню настроек"
        >
          {filteredSections.map((section, sectionIndex) => (
            <section key={section.slug} className="mb-1 last:mb-0">
              <p
                className={cn(
                  "mb-2 px-0.5 text-[15px] font-bold leading-tight tracking-tight text-foreground",
                  sectionIndex > 0 && "mt-6"
                )}
              >
                {section.title}
              </p>
              <ul className="space-y-0.5 text-[13px] leading-snug">
                {section.items.map((item) => {
                  if (item.children?.length) {
                    const open = openGroups[item.slug] ?? false;
                    const groupChildActive = item.children.some((c) =>
                      isItemActive(pathname, currentSearch, resolveSettingsItemHref(c))
                    );
                    return (
                      <li key={item.slug} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroups((prev) => ({ ...prev, [item.slug]: !open }))
                          }
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-left text-[13px] font-normal text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                            groupChildActive && "font-medium text-foreground"
                          )}
                          aria-expanded={open}
                        >
                          {open ? (
                            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          )}
                          <span>{item.title}</span>
                        </button>
                        {open && (
                          <ul className="space-y-0.5 py-0.5 pl-2">
                            {item.children.map((child) => {
                              const chref = resolveSettingsItemHref(child);
                              const childActive = isItemActive(pathname, currentSearch, chref);
                              return (
                                <li key={child.slug}>
                                  <Link
                                    href={chref}
                                    className={cn(
                                      "relative block rounded-md py-1.5 pl-8 pr-2 text-[13px] font-normal text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                                      "before:absolute before:left-4 before:top-1/2 before:size-1 before:-translate-y-1/2 before:rounded-full before:bg-muted-foreground/45",
                                      childActive &&
                                        "bg-primary/10 font-medium text-foreground before:bg-primary",
                                      childActive &&
                                        "after:pointer-events-none after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-0.5 after:rounded-l-sm after:bg-primary"
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
                  const active = isItemActive(pathname, currentSearch, href);
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        className={cn(
                          "relative block rounded-md py-1.5 pl-6 pr-2 text-[13px] font-normal text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                          "before:absolute before:left-2 before:top-1/2 before:size-1 before:-translate-y-1/2 before:rounded-full before:bg-muted-foreground/45",
                          active && "bg-primary/10 font-medium text-foreground before:bg-primary",
                          active &&
                            "after:pointer-events-none after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-0.5 after:rounded-l-sm after:bg-primary"
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
