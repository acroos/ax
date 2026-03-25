"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  developers: string[];
}

export function DeveloperSelector({ developers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("author") || "";

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") {
      params.delete("author");
    } else {
      params.set("author", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (developers.length === 0) {
    return (
      <span className="text-[12px] text-text-tertiary">
        No developer data — run ax sync to populate
      </span>
    );
  }

  return (
    <select
      value={current}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-surface-2 border border-border-subtle rounded px-2 py-1 text-[12px] text-text-secondary focus:outline-none focus:border-border-focus"
    >
      <option value="">All developers</option>
      {developers.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
