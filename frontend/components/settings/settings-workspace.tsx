"use client";

import type { ReactNode } from "react";

/**
 * Ichki sozlamalar kontenti uchun kenglik chegaramasi.
 * Ikkinchi yon panel endi `settings/layout.tsx` → SettingsShell da.
 */
export function SettingsWorkspace({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl">{children}</div>;
}
