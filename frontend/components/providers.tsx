"use client";

import { AppThemeProvider } from "@/components/app-theme-provider";
import { LoaderPrefsProvider } from "@/components/loader-prefs-provider";
import { isApiUnreachable } from "@/lib/error-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** Panel uchun: keraksiz qayta-so‘rovlarni kamaytiradi (tezroq tuyiladi). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /** Ro‘yxatlar: qisqa muddatda bir xil ma’lumot qayta olinmasin */
        staleTime: 90 * 1000,
        gcTime: 20 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        /** Backend o‘chiq bo‘lsa qayta urinmasin — konsoldagi ERR_CONNECTION_REFUSED takrorini kamaytiradi */
        retry: (failureCount, error) => {
          if (isApiUnreachable(error)) return false;
          return failureCount < 1;
        }
      },
      mutations: {
        retry: 0
      }
    }
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <LoaderPrefsProvider>{children}</LoaderPrefsProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}
