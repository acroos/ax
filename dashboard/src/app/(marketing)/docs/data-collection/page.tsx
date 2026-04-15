import fs from "fs";
import path from "path";
import Link from "next/link";
import { Markdown } from "@/components/markdown";

export default function DataCollectionPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "docs", "data-collection.md"),
    "utf-8"
  );

  return (
    <div className="max-w-[760px] mx-auto px-6 py-12">
      <Link
        href="/docs"
        className="text-accent hover:underline text-[13px] mb-6 inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M8.5 3.5L5 7L8.5 10.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to Docs
      </Link>
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 mt-4">
        <Markdown content={content} />
      </div>
    </div>
  );
}
