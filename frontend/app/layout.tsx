import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Concierge Court",
  description: "Hotel AI operations dashboard for guest conversations, decisions, and manager review"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
