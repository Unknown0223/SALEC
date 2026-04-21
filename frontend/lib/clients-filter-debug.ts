/**
 * Klientlar sahifasi filtrlari / qidiruv diagnostikasi (brauzer konsoli).
 * Sukut: o‘chiq — konsol shovqinini kamaytirish uchun.
 *
 * Yoqish — brauzer konsolida:
 *   localStorage.setItem("salesdoc.clients.filterDebug", "1")
 * keyin sahifani yangilang.
 * O‘chirish: localStorage.removeItem("salesdoc.clients.filterDebug")
 *
 * Yoki `frontend/.env.local`: NEXT_PUBLIC_CLIENTS_FILTER_DEBUG=1
 */

const LS_KEY = "salesdoc.clients.filterDebug";

export function clientsFilterDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CLIENTS_FILTER_DEBUG === "1") return true;
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "1" || v === "true" || v === "yes") return true;
  } catch {
    /* private mode */
  }
  return false;
}

export function logClientsFilters(tag: string, data: Record<string, unknown>): void {
  if (!clientsFilterDebugEnabled()) return;
  console.info(`[clients/filters] ${tag}`, data);
}
