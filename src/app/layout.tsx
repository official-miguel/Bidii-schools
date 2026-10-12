import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/ThemeProvider";
import ProductivityProvider from "@/components/ProductivityProvider";
import SuppressRechartsWarnings from "@/components/SuppressRechartsWarnings";
import PwaRegistrar, { InstallPromptScript } from "@/components/PwaRegistrar";

export const metadata: Metadata = {
  title: "Bidii School Management System",
  description: "School management system for Kenyan schools.",
  applicationName: "Bidii",
  manifest: "/manifest.json",
  // iOS: launch from the home screen as a full-screen app, not a Safari tab.
  appleWebApp: {
    capable: true,
    title: "Bidii",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
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
        <InstallPromptScript />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider>
          <PwaRegistrar />
          <SuppressRechartsWarnings />
          <ProductivityProvider>{children}</ProductivityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
