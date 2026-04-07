import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import {
  APP_THEME_ALIASES,
  APP_THEME_IDS,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME
} from "@/lib/app-theme";

const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"]
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "SALESDOC — панель",
  description: "Веб-панель мультитенантной торговой системы"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru" className={cn("font-sans", fontSans.variable)} suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} min-h-dvh antialiased`}
        suppressHydrationWarning
      >
        <Script id="salec-app-theme-boot" strategy="beforeInteractive">
          {`(function(){try{var A=${JSON.stringify([...APP_THEME_IDS])};var M=${JSON.stringify(APP_THEME_ALIASES)};var k=${JSON.stringify(APP_THEME_STORAGE_KEY)};var d=${JSON.stringify(DEFAULT_APP_THEME)};var v=localStorage.getItem(k);if(M[v])v=M[v];if(v==null||v===""||A.indexOf(v)<0){v=d;}localStorage.setItem(k,v);if(v!=="classic")document.documentElement.setAttribute("data-app-theme",v);}catch(e){}})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
