import fs from "fs";
import path from "path";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Card, CardContent } from "@/components/ui/card";

export default function DataCollectionPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "docs", "data-collection.md"),
    "utf-8"
  );

  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <Link
        href="/docs"
        className="mb-6 inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
      >
        <ChevronLeft className="size-3.5" />
        Back to Docs
      </Link>
      <Card className="mt-4">
        <CardContent>
          <Markdown content={content} />
        </CardContent>
      </Card>
    </div>
  );
}
