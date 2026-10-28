import { Suspense } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "./components/Navbar";
import SmoothScroll from "./components/SmoothScroll";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = localFont({
  src: "../public/fonts/Geist.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../public/fonts/GeistMono.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-geist-mono",
});

const helveticaNow = localFont({
  src: [
    {
      path: "../public/fonts/HelveticaNowDisplay-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/HelveticaNowDisplay-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-helvetica-now",
});

const ppLocomotive = localFont({
  src: "../public/fonts/PPLocomotiveNew-Light.woff2",
  weight: "300",
  style: "normal",
  variable: "--font-pp-locomotive",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://data.weeverything.xyz",
  ),
  applicationName: "Synthetic",
  title: {
    default: "Synthetic — Synthetic data for developers",
    template: "%s | Synthetic",
  },
  description:
    "Generate realistic, relational synthetic data for development, testing, demos, and prototypes. Define schemas, preview results, and export JSON or CSV.",
  category: "Developer tools",
  creator: "Synthetic",
  publisher: "Synthetic",
  keywords: [
    "synthetic data",
    "test data generator",
    "relational data",
    "developer tools",
    "JSON export",
    "CSV export",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Synthetic",
    title: "Synthetic — Synthetic data for developers",
    description:
      "Generate realistic, relational synthetic data for development, testing, demos, and prototypes.",
  },
  twitter: {
    card: "summary",
    title: "Synthetic — Synthetic data for developers",
    description:
      "Generate realistic, relational synthetic data for development, testing, demos, and prototypes.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${helveticaNow.variable} ${ppLocomotive.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}>
          <SmoothScroll />
        </Suspense>
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
