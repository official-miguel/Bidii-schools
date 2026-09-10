import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/ThemeProvider";
import ProductivityProvider from "@/components/ProductivityProvider";
import SuppressRechartsWarnings from "@/components/SuppressRechartsWarnings";

export const metadata: Metadata = {
  title: "Bidii School Management System",
  description: "School management system for Kenyan schools.",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/logo.png", type: "image/png" },
    shortcut: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2C7F7E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider>
          <SuppressRechartsWarnings />
          <ProductivityProvider>{children}</ProductivityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
