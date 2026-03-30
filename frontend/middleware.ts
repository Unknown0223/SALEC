import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hasFlag = request.cookies.get("sd_auth")?.value === "1";
  const { pathname } = request.nextUrl;

  const protectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/bonus-rules") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/stock") ||
    pathname.startsWith("/settings");

  if (protectedPath && !hasFlag) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/login") && hasFlag) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/products",
    "/products/:path*",
    "/bonus-rules",
    "/bonus-rules/:path*",
    "/clients",
    "/clients/:path*",
    "/orders",
    "/orders/:path*",
    "/stock",
    "/stock/:path*",
    "/settings",
    "/settings/:path*",
    "/login",
    "/login/:path*"
  ]
};
