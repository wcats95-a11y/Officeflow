import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OfficeFlow — Work, in motion",
  description: "A calm, focused workspace for managing tasks, projects and delegated work.",
  manifest: "/manifest.json",
  applicationName: "OfficeFlow",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "OfficeFlow" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><meta name="theme-color" content="#0f766e"/><link rel="apple-touch-icon" href="/icons/icon-192.png"/></head><body>{children}</body></html>;
}