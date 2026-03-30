import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Savdo tizimi</h1>
        <p className="text-sm text-muted-foreground">
          Next.js panel (Bosqich 2 skaffold): kirish va himoyalangan dashboard.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Kirish
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Dashboard
          </Link>
          <Link
            href="/products"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Mahsulotlar
          </Link>
          <Link
            href="/bonus-rules/active"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Bonus qoidalari
          </Link>
        </div>
      </div>
    </main>
  );
}
