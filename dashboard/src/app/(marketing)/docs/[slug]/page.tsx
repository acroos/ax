import fs from "fs";
import path from "path";

import { Markdown } from "@/components/markdown";
import { Card, CardContent } from "@/components/ui/card";

import { BackToDocsLink } from "../back-to-docs-link";

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
      <div className="mx-auto max-w-[760px] px-6 py-12">
        <BackToDocsLink />
        <div className="mt-8 text-muted-foreground">
          Metric document not found:{" "}
          <code className="text-foreground">{slug}.md</code>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <div className="mb-4">
        <BackToDocsLink />
      </div>
      <Card>
        <CardContent>
          <Markdown content={content} />
        </CardContent>
      </Card>
    </div>
  );
}
