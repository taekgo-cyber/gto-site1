import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { getSiteUrl } from "@/lib/seo/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "트럭포털",
    template: "%s | 트럭포털",
  },
  description: "운송/화물차 관련 정보를 제공하는 포털 사이트입니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full min-w-0 flex-col overflow-x-clip antialiased">
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-50 rounded-md bg-background px-4 py-3 font-medium text-foreground shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          본문 바로가기
        </a>
        <Header />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
