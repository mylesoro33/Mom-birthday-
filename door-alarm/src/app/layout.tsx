import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Door Alarm",
  description: "Rings your phone loudly when your DoorDash order arrives.",
  appleWebApp: { capable: true, title: "Door Alarm", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0f12" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <span className="logo" aria-hidden="true">🚪</span>
          <span className="brand">Door Alarm</span>
        </header>
        <main className="main">{children}</main>
        <Nav />
      </body>
    </html>
  );
}
