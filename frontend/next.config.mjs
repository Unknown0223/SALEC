/** @type {import('next').NextConfig} */
const nextConfig = {
  // @tanstack/query-core sinf ichidagi #private maydonlarni loyiha SWC orqali maqsad brauzerga moslashtiradi
  // (aks holda ba’zi muhitlarda "Invalid or unexpected token" / layout.js xatosi).
  transpilePackages: ["@tanstack/react-query", "@tanstack/query-core"]
};

export default nextConfig;
