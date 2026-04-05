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

export function getUserFacingError(error: unknown, fallback = "Xatolik yuz berdi"): string {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (status === 401) return "Sessiya tugagan, qayta kiring.";
    if (status === 403) return "Bu amal uchun ruxsat yo'q.";
    if (status === 404) return "Ma'lumot topilmadi.";
    if (status === 503) return "Servis vaqtincha mavjud emas. Keyinroq qayta urinib ko'ring.";
    if (status && status >= 500) return "Serverda xatolik. Qayta urinish mumkin.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
