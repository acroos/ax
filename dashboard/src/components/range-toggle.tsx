"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const RANGES = ["7d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];

export function RangeToggle({ current }: { current: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(range: Range) {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "30d") {
      params.delete("range"); // 30d is default — keep URL clean
    } else {
      params.set("range", range);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => handleChange(r)}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
            r === current
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
