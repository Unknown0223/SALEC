import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hasFlag = request.cookies.get("sd_auth")?.value === "1";
  const { pathname } = request.nextUrl;

  if (pathname === "/bonus-rules" || pathname.startsWith("/bonus-rules/")) {
    const url = request.nextUrl.clone();
    url.pathname =
      pathname === "/bonus-rules"
        ? "/settings/bonus-rules"
        : `/settings/bonus-rules${pathname.slice("/bonus-rules".length)}`;
    return NextResponse.redirect(url);
  }

  /** Mahsulotlar katalogi — «Настройки → Продукт» (referens UI) */
  if (pathname === "/products" || pathname === "/products/") {
    const url = request.nextUrl.clone();
    url.pathname = "/settings/products";
    return NextResponse.redirect(url);
  }
  if (pathname === "/products/bulk" || pathname.startsWith("/products/bulk/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/products/, "/settings/products");
    return NextResponse.redirect(url);
  }
  if (pathname === "/products/excel" || pathname.startsWith("/products/excel/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/products/, "/settings/products");
    return NextResponse.redirect(url);
  }

  const protectedPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/products") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/payments") ||
    pathname.startsWith("/client-expenses") ||
    pathname.startsWith("/initial-client-balances") ||
    pathname.startsWith("/client-balances") ||
    pathname.startsWith("/returns") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/stock") ||
    pathname.startsWith("/visits") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/routes") ||
    pathname.startsWith("/territories") ||
    pathname.startsWith("/expenses") ||
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
    "/payments",
    "/payments/:path*",
    "/client-expenses",
    "/client-expenses/:path*",
    "/initial-client-balances",
    "/initial-client-balances/:path*",
    "/client-balances",
    "/client-balances/:path*",
    "/returns",
    "/returns/:path*",
    "/reports",
    "/reports/:path*",
    "/stock",
    "/stock/:path*",
    "/visits",
    "/visits/:path*",
    "/tasks",
    "/tasks/:path*",
    "/routes",
    "/routes/:path*",
    "/territories",
    "/territories/:path*",
    "/expenses",
    "/expenses/:path*",
    "/settings",
    "/settings/:path*",
    "/login",
    "/login/:path*"
  ]
};
