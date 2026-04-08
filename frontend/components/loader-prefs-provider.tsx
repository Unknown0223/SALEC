"use client";

import {
  DEFAULT_LOADER_PREFS,
  LOADER_PREFS_STORAGE_KEY,
  type LoaderPrefs,
  parseLoaderPrefs
} from "@/lib/loader-prefs";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Ctx = {
  prefs: LoaderPrefs;
  setPrefs: (patch: Partial<LoaderPrefs>) => void;
  resetPrefs: () => void;
};

const LoaderPrefsContext = createContext<Ctx | null>(null);

function readStored(): LoaderPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_LOADER_PREFS };
  try {
    return parseLoaderPrefs(localStorage.getItem(LOADER_PREFS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_LOADER_PREFS };
  }
}

export function LoaderPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<LoaderPrefs>(DEFAULT_LOADER_PREFS);

  useEffect(() => {
    setPrefsState(readStored());
  }, []);

  const setPrefs = useCallback((patch: Partial<LoaderPrefs>) => {
    setPrefsState((prev) => {
      const next = parseLoaderPrefs(JSON.stringify({ ...prev, ...patch }));
      try {
        localStorage.setItem(LOADER_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULT_LOADER_PREFS };
    setPrefsState(next);
    try {
      localStorage.setItem(LOADER_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ prefs, setPrefs, resetPrefs }), [prefs, setPrefs, resetPrefs]);

  return <LoaderPrefsContext.Provider value={value}>{children}</LoaderPrefsContext.Provider>;
}

export function useLoaderPrefs() {
  const ctx = useContext(LoaderPrefsContext);
  if (!ctx) throw new Error("useLoaderPrefs must be used within LoaderPrefsProvider");
  return ctx;
}
