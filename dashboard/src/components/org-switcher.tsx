"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Org {
  slug: string;
  name: string;
  is_personal: boolean;
}

export function OrgSwitcher({
  orgs,
  currentSlug,
}: {
  orgs: Org[];
  currentSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = orgs.find((o) => o.slug === currentSlug) || orgs[0];
  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-surface-2 transition-colors text-left"
      >
        <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center flex-shrink-0">
          <span className="text-accent text-[10px] font-bold">
            {current.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-[13px] text-text-primary font-medium truncate flex-1">
          {current.name}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="text-text-tertiary flex-shrink-0"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-1 border border-border-subtle rounded-lg shadow-lg z-50 py-1">
          {orgs.map((org) => (
            <Link
              key={org.slug}
              href={`/${org.slug}`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-surface-2 transition-colors ${
                org.slug === currentSlug
                  ? "text-text-primary font-medium"
                  : "text-text-secondary"
              }`}
            >
              <div className="w-4 h-4 rounded bg-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-accent text-[8px] font-bold">
                  {org.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="truncate">{org.name}</span>
              {org.is_personal && (
                <span className="text-[10px] text-text-tertiary ml-auto">Personal</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
