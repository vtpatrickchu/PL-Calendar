
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Calendar Dashboard",
  description: "Upload a CSV to generate trading calendar charts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
