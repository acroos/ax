import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";

import { ThemeProvider } from "@/components/theme-provider";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NextTopLoader
            color="#B0602F"
            height={2}
            shadow="0 0 10px #B0602F, 0 0 5px #B0602F"
            showSpinner={false}
            easing="ease"
            speed={200}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
