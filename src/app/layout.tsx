import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "PromiseGuard checks every promise sales made in emails and calls against the quotation, flags what is missing or conflicting before the quote is sent, and hands agreed promises to delivery with evidence.";

export const metadata: Metadata = {
  title: {
    default: "PromiseGuard · Catch promises the quote forgot",
    template: "%s · PromiseGuard",
  },
  description: DESCRIPTION,
  applicationName: "PromiseGuard",
  keywords: ["PromiseGuard", "quote review", "sales promises", "scope gaps", "Graph8", "CRM", "quotation", "deal desk"],
  openGraph: {
    type: "website",
    siteName: "PromiseGuard",
    title: "PromiseGuard · Catch promises the quote forgot",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "PromiseGuard · Catch promises the quote forgot",
    description: DESCRIPTION,
  },
  // Private, password-protected workspace: keep it out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
