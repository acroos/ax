"use client";

import dynamic from "next/dynamic";

// Dynamically import NProgress so its JS + CSS don't block first paint.
// The loader only needs to be ready *after* initial render — it activates
// on subsequent <Link> navigations, not the first page load.
const NextTopLoader = dynamic(() => import("nextjs-toploader"), {
  ssr: false,
});

export function TopLoader() {
  return (
    <NextTopLoader
      color="var(--color-primary)"
      height={2}
      shadow="0 0 10px var(--color-primary), 0 0 5px var(--color-primary)"
      showSpinner={false}
      easing="ease"
      speed={200}
    />
  );
}
