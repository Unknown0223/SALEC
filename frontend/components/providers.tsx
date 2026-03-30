"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** Panel uchun: keraksiz qayta-so‘rovlarni kamaytiradi (tezroq tuyiladi). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /** Ro‘yxat sahifalarida tez-tez qayta yuklashni kamaytiradi */
        staleTime: 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1
      }
    }
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
