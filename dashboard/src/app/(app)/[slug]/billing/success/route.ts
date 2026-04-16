import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// Stripe Checkout success landing route.
//
// Stripe redirects here after a successful upgrade. We bust the org's layout
// cache so that other pages (compare, metrics, etc.) don't serve stale data
// reflecting the pre-upgrade plan, then forward on to the billing page with
// ?billing=success so the UI shows the confirmation banner.
//
// revalidatePath cannot be called during a Server Component render, so this
// handler exists specifically to perform that cache bust outside of render.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  revalidatePath(`/${slug}`, "layout");
  return NextResponse.redirect(
    new URL(`/${slug}/billing?billing=success`, req.url)
  );
}
