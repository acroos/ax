import { redirect } from "next/navigation";

// /{slug} redirects to the PRs page within this org
export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ repo?: string }>;
}) {
  const { slug } = await params;
  const { repo } = await searchParams;

  const url = repo ? `/${slug}/prs?repo=${repo}` : `/${slug}/prs`;
  redirect(url);
}
