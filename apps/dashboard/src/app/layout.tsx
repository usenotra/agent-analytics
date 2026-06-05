import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Analytics Dashboard",
  description: "Track AI agent citations to your website",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
