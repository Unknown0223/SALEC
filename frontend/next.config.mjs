/** @type {import('next').NextConfig} */
const nextConfig = {
  // @tanstack/query-core sinf ichidagi #private maydonlarni loyiha SWC orqali maqsad brauzerga moslashtiradi
  // (aks holda ba’zi muhitlarda "Invalid or unexpected token" / layout.js xatosi).
  transpilePackages: ["@tanstack/react-query", "@tanstack/query-core"],
  /**
   * Dev: brauzer so‘rovlari `localhost:3000` orqali ketadi — API o‘chiq bo‘lsa
   * `net::ERR_CONNECTION_REFUSED` o‘rniga Next proxy xatosi (kamroq shovqin).
   * `NEXT_PUBLIC_API_URL` berilsa — to‘g‘ridan-to‘g‘ri API ga ulanish, rewrite yo‘q.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    if (process.env.NEXT_PUBLIC_API_URL?.trim()) return [];
    const target = process.env.API_INTERNAL_ORIGIN?.trim() || "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/auth/:path*", destination: `${target}/auth/:path*` }
    ];
  }
};

export default nextConfig;
