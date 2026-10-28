import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OfficeFlow — Work, in motion",
  description: "A calm, focused workspace for managing tasks, projects and delegated work."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}