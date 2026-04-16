import fs from "fs";
import path from "path";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Card, CardContent } from "@/components/ui/card";

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
        <BackLink />
        <div className="mt-8 text-muted-foreground">
          Metric document not found:{" "}
          <code className="text-foreground">{slug}.md</code>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <BackLink />
      <Card className="mt-4">
        <CardContent>
          <Markdown content={content} />
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/docs"
      className="mb-4 inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
    >
      <ChevronLeft className="size-3.5" />
      Back to Docs
    </Link>
  );
}
