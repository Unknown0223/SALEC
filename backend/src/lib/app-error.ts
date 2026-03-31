export type AppErrorCode =
  | "NOT_FOUND"
  | "BAD_CLIENT"
  | "BAD_WAREHOUSE"
  | "BAD_AGENT"
  | "BAD_PRODUCT"
  | "BAD_QTY"
  | "EMPTY_ITEMS"
  | "NO_PRICE"
  | "CREDIT_LIMIT_EXCEEDED"
  | "ORDER_NOT_EDITABLE"
  | "FORBIDDEN_OPERATOR_ORDER_LINES_EDIT"
  | "EMPTY_META_PATCH"
  | "INVALID_STATUS"
  | "INVALID_TRANSITION"
  | "FORBIDDEN_REVERT"
  | "FORBIDDEN_REOPEN_CANCELLED"
  | "FORBIDDEN_OPERATOR_CANCEL_LATE";

export class AppError extends Error {
  code: AppErrorCode;
  meta?: Record<string, unknown>;

  constructor(code: AppErrorCode, meta?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.meta = meta;
  }
}

export function appError(code: AppErrorCode, meta?: Record<string, unknown>): AppError {
  return new AppError(code, meta);
}

export function getErrorCode(err: unknown): string | undefined {
  if (err instanceof AppError) return err.code;
  if (err instanceof Error) return err.message;
  return undefined;
}
