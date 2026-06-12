import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Openline",
    template: "%s | Openline",
  },
  description: "Public-evidence outreach research, internal draft review, and manual ZeptoMail sends.",
  icons: {
    icon: "/openline-logo.png",
    apple: "/openline-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
