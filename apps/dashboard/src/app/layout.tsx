import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Analytics Dashboard",
  description: "Track AI agent citations to your website",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", figtree.variable)} suppressHydrationWarning>
      <body className={`${figtree.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
