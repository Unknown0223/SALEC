"use client";

import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  type AppThemeId,
  normalizeAppThemeId
} from "@/lib/app-theme";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Ctx = {
  theme: AppThemeId;
  setTheme: (id: AppThemeId) => void;
};

const AppThemeContext = createContext<Ctx | null>(null);

function readStoredTheme(): AppThemeId {
  if (typeof window === "undefined") return DEFAULT_APP_THEME;
  try {
    const stored = localStorage.getItem(APP_THEME_STORAGE_KEY);
    const normalized = normalizeAppThemeId(stored);
    if (normalized) {
      if (stored !== normalized) localStorage.setItem(APP_THEME_STORAGE_KEY, normalized);
      return normalized;
    }
    if (stored) localStorage.removeItem(APP_THEME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return DEFAULT_APP_THEME;
}

function applyThemeToDocument(id: AppThemeId) {
  const root = document.documentElement;
  if (id === "classic") root.removeAttribute("data-app-theme");
  else root.setAttribute("data-app-theme", id);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(DEFAULT_APP_THEME);

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((id: AppThemeId) => {
    setThemeState(id);
    try {
      localStorage.setItem(APP_THEME_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    applyThemeToDocument(id);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}
