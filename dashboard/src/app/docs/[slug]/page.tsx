import fs from "fs";
import path from "path";
import Link from "next/link";
import { Markdown } from "@/components/markdown";

const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");

export function generateStaticParams() {
  const files = fs
    .readdirSync(metricsDir)
    .filter((f) => f.endsWith(".md") && f !== "index.md");

  return files.map((f) => ({
    slug: f.replace(/\.md$/, ""),
  }));
}

export default async function MetricDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const filePath = path.join(metricsDir, `${slug}.md`);

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return (
      <div>
        <Link
          href="/docs"
          className="text-accent hover:underline text-[13px] mb-4 inline-flex items-center gap-1.5"
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
        <div className="mt-8 text-text-secondary">
          Metric document not found: <code className="text-text-primary">{slug}.md</code>
        </div>
      </div>
    );
  }

  return (
    <div>
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
