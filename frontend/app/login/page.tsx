"use client";

import { Button } from "@/components/ui/button";
import { apiBaseURL } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import axios, { isAxiosError } from "axios";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [slug, setSlug] = useState("test1");
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await axios.post(`${apiBaseURL}/auth/login`, {
        slug,
        login,
        password
      });
      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenantSlug: slug,
        role: data.user?.role as string | undefined
      });
      const from = searchParams.get("from") ?? "/dashboard";
      router.replace(from);
      router.refresh();
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const st = err.response?.status;
        const body = err.response?.data as
          | { error?: string; message?: string }
          | undefined;
        if (st === 401 || body?.error === "INVALID_CREDENTIALS") {
          setError("Login yoki parol noto‘g‘ri.");
          return;
        }
        if (st === 404 || body?.error === "TENANT_NOT_FOUND") {
          setError("Bunday diler (slug) topilmadi yoki o‘chirilgan.");
          return;
        }
        if (body?.message && typeof body.message === "string") {
          setError(body.message);
          return;
        }
        if (st === 503) {
          setError(
            "Server tayyor emas (odatda baza yoki migratsiya). Backend papkasida: npm run db:deploy va PostgreSQL ishlayotganini tekshiring."
          );
          return;
        }
      }
      setError("Serverga ulanib bo‘lmadi yoki kutilmagan xato. Backend 4000-portda ishlayotganini tekshiring.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.62_0.12_175/0.22),transparent)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/20" aria-hidden />
      <div className="relative w-full max-w-sm space-y-6 rounded-2xl border border-border/80 bg-card/95 p-6 shadow-panel-md backdrop-blur-sm">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-primary" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Kirish</h1>
          <p className="text-sm text-muted-foreground">Diler slug va foydalanuvchi ma’lumotlari</p>
          <p className="text-xs text-muted-foreground">
            Import: <code className="text-[10px]">npm run import:once</code> — slug bilan bir xil kirish kerak
            (odatda <span className="font-medium">test1</span>). Namuna xodimlar:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">demo_sup_sample</code> va hokazo — parol{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Parol123!</code>.
          </p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="slug">
              Diler (slug)
            </label>
            <input
              id="slug"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              autoComplete="organization"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="login">
              Login
            </label>
            <input
              id="login"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Parol
            </label>
            <input
              id="password"
              type="password"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Kutilmoqda…" : "Kirish"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/">Bosh sahifa</Link>
        </p>
      </div>
    </main>
  );
}
