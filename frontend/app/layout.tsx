import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Concierge Court",
  description: "Agentic hotel guest-relations demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
