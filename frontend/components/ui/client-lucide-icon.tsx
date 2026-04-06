"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Lucide SVG larni SSR + gidratsiyadan keyin chizadi.
 * Dark Reader kabi kengaytirishlar SVG ga atribut qo‘shganda «Extra attributes» xatosini oldini oladi.
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={cn("inline-block", className)} aria-hidden={ariaHidden} />;
  }

  return <Icon className={className} aria-hidden={ariaHidden} />;
}
