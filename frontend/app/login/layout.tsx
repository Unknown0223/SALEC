import { Suspense } from "react";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-center text-sm text-muted-foreground">Yuklanmoqda…</div>}>{children}</Suspense>;
}
