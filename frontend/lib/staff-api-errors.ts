import type { AxiosError } from "axios";

/** POST /agents|expeditors|supervisors|operators — login band */
export function messageFromStaffCreateError(err: unknown): string | null {
  const ax = err as AxiosError<{ error?: string }>;
  const status = ax.response?.status;
  const code = ax.response?.data?.error;
  if (status === 409 && code === "LoginExists") {
    return "Bu login allaqachon band. Boshqa login kiriting.";
  }
  if (status === 409 && code === "CashDeskUserLinkExists") {
    return "Bu foydalanuvchi allaqachon boshqa kassaga bog‘langan.";
  }
  return null;
}
