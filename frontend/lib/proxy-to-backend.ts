import { NextRequest, NextResponse } from "next/server";

/** Server-only: brauzer bundle ga kirmaydi — Railway da runtime da qo‘yish mumkin. */
export function backendOriginForProxy(): string | null {
  const u =
    process.env.API_INTERNAL_ORIGIN?.trim() ||
    process.env.BACKEND_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!u) return null;
  return u.replace(/\/$/, "");
}

/**
 * Next.js dan kelgan so‘rovni Fastify backend ga uzatadi (`/auth/*`, `/api/*`).
 * `NEXT_PUBLIC_API_URL` bo‘sh bo‘lsa ham ishlaydi — frontend servisida `API_INTERNAL_ORIGIN` bo‘lsa kifoya.
 */
export async function proxyToBackend(
  req: NextRequest,
  backendPrefix: "/auth" | "/api",
  pathSegments: string[]
): Promise<NextResponse> {
  const base = backendOriginForProxy();
  if (!base) {
    return NextResponse.json(
      { error: "SERVICE_MISCONFIGURED", message: "Set API_INTERNAL_ORIGIN or NEXT_PUBLIC_API_URL on the frontend service." },
      { status: 503 }
    );
  }

  const rest = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
  const targetUrl = `${base}${backendPrefix}${rest}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual"
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const res = await fetch(targetUrl, init);
  const out = new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText
  });

  res.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "connection" || k === "transfer-encoding") return;
    out.headers.set(key, value);
  });

  return out;
}
