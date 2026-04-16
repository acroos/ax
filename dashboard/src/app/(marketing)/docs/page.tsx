import fs from "fs"
import { FileText } from "lucide-react"
import Link from "next/link"
import path from "path"

export default function DocsPage() {
  const metricsDir = path.join(process.cwd(), "..", "docs", "metrics")
  const indexContent = fs.readFileSync(
    path.join(metricsDir, "index.md"),
    "utf-8",
  )

  const files = fs
    .readdirSync(metricsDir)
    .filter((f) => f.endsWith(".md") && f !== "index.md")
    .sort()

  const metrics = files.map((f) => {
    const slug = f.replace(/\.md$/, "")
    const content = fs.readFileSync(path.join(metricsDir, f), "utf-8")
    const titleMatch = content.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : slug
    return { slug, title }
  })

  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <h1 className="mb-6 font-serif text-[32px] font-semibold text-foreground">
        Metric Documentation
      </h1>
      <div className="grid gap-2">
        {metrics.map((m) => (
          <Link
            key={m.slug}
            href={`/docs/${m.slug}`}
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground" />
            <span className="text-[14px] font-medium text-foreground transition-colors group-hover:text-accent-foreground">
              {m.title}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
