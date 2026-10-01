import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter med tabulære tall (font-variant-numeric i CSS), så tallene står rett under hverandre.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NM Insights",
  description: "Dashboard for sosiale medier – Nordbø Marketing",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
