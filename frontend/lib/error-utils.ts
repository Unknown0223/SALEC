import { isAxiosError } from "axios";

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
