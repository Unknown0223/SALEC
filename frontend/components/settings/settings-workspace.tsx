"use client";

import type { ReactNode } from "react";

/**
 * Sozlamalar asosiy maydoni — to‘liq kenglik (jadval/katalog uchun).
 * Torroq forma kerak bo‘lsa, sahifa ichida `max-w-*` qo‘llanadi.
 */
export function SettingsWorkspace({ children }: { children: ReactNode }) {
  return <div className="w-full min-w-0 max-w-none">{children}</div>;
}
