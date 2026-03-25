"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const presets = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export function TimeWindowPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSince = searchParams.get("since") || "";

  function handlePreset(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (days === 0) {
      params.delete("since");
      params.delete("until");
    } else {
      params.set("since", daysAgo(days));
      params.delete("until");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function isActive(days: number): boolean {
    if (days === 0) return !currentSince;
    return currentSince === daysAgo(days);
  }

  return (
    <div className="flex items-center gap-1">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => handlePreset(p.days)}
          className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
            isActive(p.days)
              ? "bg-surface-3 text-text-primary"
              : "text-text-tertiary hover:text-text-secondary hover:bg-surface-2"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
