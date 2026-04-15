import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AX — Agentic Coding Metrics",
  description: "Measure how effectively you work with AI coding agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
