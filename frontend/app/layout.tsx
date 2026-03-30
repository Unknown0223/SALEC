import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";

const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"]
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Savdo — panel",
  description: "Multi-tenant savdo tizimi web paneli"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="uz" className={cn("font-sans", fontSans.variable)}>
      <body className={`${fontSans.variable} ${fontMono.variable} min-h-dvh antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
