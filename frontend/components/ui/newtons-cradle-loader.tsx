"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

type Props = {
  /** Konteyner eni/balandligi (px), default 50 */
  size?: number;
  className?: string;
  /** Aria / ekran o‘qiydigan matn */
  label?: string;
};

/**
 * Newton’s cradle — CSS `globals.css` (.newtons-cradle*).
 * Manba: Uiverse.io (dovatgabriel), loyiha temasiga moslashtirilgan.
 */
export function NewtonsCradleLoader({ size = 50, className, label = "Yuklanmoqda" }: Props) {
  const style = {
    "--uib-size": `${size}px`
  } as CSSProperties;

  return (
    <div
      className={cn("newtons-cradle", className)}
      style={style}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      <div className="newtons-cradle__dot" aria-hidden />
      <div className="newtons-cradle__dot" aria-hidden />
      <div className="newtons-cradle__dot" aria-hidden />
      <div className="newtons-cradle__dot" aria-hidden />
    </div>
  );
}
