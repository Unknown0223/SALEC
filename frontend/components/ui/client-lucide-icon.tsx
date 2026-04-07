"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Lucide ikonkasi. Oldingi variantda faqat clientda chizilardi — birinchi kadrda bo‘sh joy qolardi.
 * Endi SSR va birinchi bo‘yoqda ham SVG darhol ko‘rinadi (sidebar ikonkalari yo‘qolmasin).
 */
export function ClientLucideIcon({
  icon: Icon,
  className,
  ariaHidden = true
}: {
  icon: LucideIcon;
  className?: string;
  ariaHidden?: boolean;
}) {
  return <Icon className={cn(className)} aria-hidden={ariaHidden} />;
}
