/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /** Dev HMR va prod bundle: faqat ishlatilgan ikonka / modul tarmoqlari */
    optimizePackageImports: ["lucide-react", "recharts"]
  },
  // @tanstack/query-core sinf ichidagi #private maydonlarni loyiha SWC orqali maqsad brauzerga moslashtiradi
  // (aks holda ba’zi muhitlarda "Invalid or unexpected token" / layout.js xatosi).
  transpilePackages: ["@tanstack/react-query", "@tanstack/query-core"],
  /**
   * Dev: brauzer so‘rovlari `localhost:3000` orqali ketadi — API o‘chiq bo‘lsa
   * `net::ERR_CONNECTION_REFUSED` o‘rniga Next proxy xatosi (kamroq shovqin).
   * `NEXT_PUBLIC_API_URL` berilsa — to‘g‘ridan-to‘g‘ri API ga ulanish, rewrite yo‘q.
   */
  async rewrites() {
    /** To‘g‘ridan-to‘g‘ri backend URL — proxy kerak emas (CORS backendda ochiq bo‘lishi kerak). */
    if (process.env.NEXT_PUBLIC_API_URL?.trim()) return [];

    const devTarget = process.env.API_INTERNAL_ORIGIN?.trim() || "http://127.0.0.1:18080";
    if (process.env.NODE_ENV === "development") {
      return [
        { source: "/api/:path*", destination: `${devTarget}/api/:path*` },
        { source: "/auth/:path*", destination: `${devTarget}/auth/:path*` }
      ];
    }

    /**
     * Prod (masalan Railway): frontend va backend alohida — brauzer `/auth/login` ni shu hostga yuboradi.
     * `API_INTERNAL_ORIGIN` build vaqtida berilsa, Next server so‘rovni backendga proxylaydi (404 yo‘q).
     */
    const prodTarget = process.env.API_INTERNAL_ORIGIN?.trim();
    if (!prodTarget) return [];
    return [
      { source: "/api/:path*", destination: `${prodTarget}/api/:path*` },
      { source: "/auth/:path*", destination: `${prodTarget}/auth/:path*` }
    ];
  }
};

export default nextConfig;
