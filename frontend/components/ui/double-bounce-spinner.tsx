"use client";

import { cn } from "@/lib/utils";

type Props = {
  /** Pikselda; default 40 */
  size?: number;
  className?: string;
  /** Aria uchun */
  label?: string;
};

/**
 * Ikki doira «pulse» animatsiyasi — `globals.css`dagi `.spinner-double-bounce*`
 */
export function DoubleBounceSpinner({ size = 40, className, label = "Yuklanmoqda" }: Props) {
  return (
    <div
      className={cn("spinner-double-bounce", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="spinner-double-bounce__bounce1" aria-hidden />
      <div className="spinner-double-bounce__bounce2" aria-hidden />
    </div>
  );
}
