import { isAxiosError } from "axios";

/** Brauzerda server o‘chiq / noto‘g‘ri port — odatda `response` bo‘lmaydi */
export function isApiUnreachable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response != null) return false;
  const code = error.code;
  if (code === "ERR_NETWORK" || code === "ECONNABORTED") return true;
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("network error")) return true;
  if (msg.includes("econnrefused")) return true;
  if (msg.includes("failed to fetch")) return true;
  return false;
}

export function getUserFacingError(error: unknown, fallback = "Произошла ошибка"): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (status === 401) return "Сессия истекла, войдите снова.";
    if (status === 403) return "Недостаточно прав для этого действия.";
    if (status === 404) return "Данные не найдены.";
    if (status === 503) return "Сервис временно недоступен. Попробуйте позже.";
    if (status && status >= 500) return "Ошибка сервера. Можно повторить запрос.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
