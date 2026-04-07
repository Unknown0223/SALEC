import { Suspense, type ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-center text-sm text-muted-foreground">Загрузка…</div>}>{children}</Suspense>;
}
