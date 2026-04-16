import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackToDocsLink() {
  return (
    <Link
      href="/docs"
      className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
    >
      <ChevronLeft className="size-3.5" />
      Back to Docs
    </Link>
  );
}
