import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NM Insights",
  description: "Dashboard for sosiale medier – Nordbø Marketing",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
