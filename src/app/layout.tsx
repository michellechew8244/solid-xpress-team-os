import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solid Xpress Team OS",
  description:
    "Team management, KPI, gamification and performance reward platform for Solid Xpress M Sdn Bhd.",
};

// Mobile-first: fit device width, allow user zoom for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
