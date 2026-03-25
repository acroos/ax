import fs from "fs";
import path from "path";
import Link from "next/link";
import { Markdown } from "@/components/markdown";

export default function DocsPage() {
  const metricsDir = path.join(process.cwd(), "..", "docs", "metrics");
  const indexContent = fs.readFileSync(
    path.join(metricsDir, "index.md"),
    "utf-8"
  );

  const files = fs
    .readdirSync(metricsDir)
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .sort();

  const metrics = files.map((f) => {
    const slug = f.replace(/\.md$/, "");
    const content = fs.readFileSync(path.join(metricsDir, f), "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : slug;
    return { slug, title };
  });

  return (
    <div>
      <h1 className="text-text-primary text-xl font-semibold mb-6">
        Metric Documentation
      </h1>

      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 mb-8">
        <Markdown content={indexContent} />
      </div>

      <h2 className="text-text-primary text-lg font-medium mb-4">
        All Metric Docs
      </h2>
      <div className="grid gap-2">
        {metrics.map((m) => (
          <Link
            key={m.slug}
            href={`/docs/${m.slug}`}
            className="flex items-center gap-3 px-4 py-3 bg-surface-1 rounded-lg border border-border-subtle hover:bg-surface-2 transition-colors group"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              className="opacity-40 group-hover:opacity-70 transition-opacity flex-shrink-0"
            >
              <path
                d="M4 2.5H11C11.28 2.5 11.5 2.72 11.5 3V12C11.5 12.28 11.28 12.5 11 12.5H4C3.72 12.5 3.5 12.28 3.5 12V3C3.5 2.72 3.72 2.5 4 2.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M5.5 5.5H9.5M5.5 7.5H9.5M5.5 9.5H8"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-text-secondary group-hover:text-text-primary text-[14px] font-medium transition-colors">
              {m.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
