import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.axmetrics.dev",
  ),
  title: { default: "AX — Agentic Coding Metrics", template: "%s · AX" },
  description: "Measure how effectively you work with AI coding agents",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF5EC" },
    { media: "(prefers-color-scheme: dark)", color: "#14110C" },
  ],
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
            color="var(--color-primary)"
            height={2}
            shadow="0 0 10px var(--color-primary), 0 0 5px var(--color-primary)"
            showSpinner={false}
            easing="ease"
            speed={200}
          />
          {children}
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
