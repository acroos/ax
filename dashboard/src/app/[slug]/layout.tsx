import { getCurrentUser, isAPIMode } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // In managed mode, verify the user is a member of this org
  if (isAPIMode()) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const isMember = user.organizations.some((o) => o.slug === slug);
    if (!isMember) {
      // Redirect to their first org
      const defaultOrg = user.organizations[0]?.slug;
      if (defaultOrg) redirect(`/${defaultOrg}`);
      redirect("/login");
    }
  }

  return <>{children}</>;
}
