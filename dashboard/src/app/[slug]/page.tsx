import { redirect } from "next/navigation";
import { isAPIMode } from "@/lib/auth";

// In managed mode, /{slug} shows the org overview.
// In local mode, this route doesn't apply — the root / page handles everything.
export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  if (!isAPIMode()) {
    redirect("/");
  }

  const { slug } = await params;
  const { repo } = await searchParams;

  // For now, redirect to the PRs page within this org
  const url = repo ? `/${slug}/prs?repo=${repo}` : `/${slug}/prs`;
  redirect(url);
}
