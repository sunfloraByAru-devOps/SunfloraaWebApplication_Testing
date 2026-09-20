/* Things that are wrong with the shop right now.
 *
 * These are the problems Aru cannot see from any single screen: a product
 * that is live with no photos looks fine in the product list, but customers
 * land on an empty gallery. Each issue names the fix and links straight to it. */

import { supabase } from "../supabase";

export type Issue = {
  id: string;
  severity: "bad" | "warn";
  title: string;
  detail: string;
  href: string;
  action: string;
};

/** Read the marker the database keeps whenever shop content changes. */
export async function getContentChangedAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from("site_settings").select("value").eq("key", "content_changed_at").maybeSingle();
  if (error || !data) return null;
  return data.value ?? null;
}

export type PublishState = { pending: boolean; changedAt: string | null; builtAt: string };

/** The storefront is a build-time snapshot, so edits are not live until it is
 *  rebuilt. builtAt is stamped into the admin page when the site is built. */
export async function getPublishState(builtAt: string): Promise<PublishState> {
  const changedAt = await getContentChangedAt();
  const pending = !!changedAt && !!builtAt && new Date(changedAt) > new Date(builtAt);
  return { pending, changedAt, builtAt };
}

export async function findIssues(): Promise<Issue[]> {
  const issues: Issue[] = [];

  const [{ data: products }, { data: pendingReviews }, { data: failedMail }] = await Promise.all([
    supabase.from("products_with_image")
      .select("id, name, is_active, in_stock, base_price, category_id, primary_image_path"),
    supabase.from("reviews").select("id", { count: "exact" }).eq("is_approved", false).limit(1),
    supabase.from("order_notifications").select("id, order_id").eq("status", "failed").limit(5),
  ]);

  for (const p of products ?? []) {
    if (p.is_active && !p.primary_image_path) {
      issues.push({
        id: `nophoto-${p.id}`, severity: "bad",
        title: `${p.name} has no photos`,
        detail: "It's showing in the shop, so customers land on an empty page.",
        href: `#/products/${p.id}`, action: "Add photos",
      });
    }
    if (p.is_active && !p.in_stock) {
      issues.push({
        id: `oos-${p.id}`, severity: "warn",
        title: `${p.name} is out of stock`,
        detail: "Still visible in the shop, but nobody can buy it.",
        href: `#/products/${p.id}`, action: "Open",
      });
    }
    if (p.is_active && (p.base_price === null || Number(p.base_price) <= 0)) {
      issues.push({
        id: `noprice-${p.id}`, severity: "bad",
        title: `${p.name} has no price`,
        detail: "It's live in the shop without one.",
        href: `#/products/${p.id}`, action: "Set a price",
      });
    }
    if (p.is_active && !p.category_id) {
      issues.push({
        id: `nocat-${p.id}`, severity: "warn",
        title: `${p.name} isn't in a category`,
        detail: "Harder for customers to find while browsing.",
        href: `#/products/${p.id}`, action: "Choose one",
      });
    }
  }

  for (const n of failedMail ?? []) {
    issues.push({
      id: `mail-${n.id}`, severity: "bad",
      title: "An email to a customer didn't send",
      detail: "They haven't been told their order changed.",
      href: `#/orders/${n.order_id}`, action: "Open the order",
    });
  }

  if ((pendingReviews?.length ?? 0) > 0) {
    issues.push({
      id: "reviews", severity: "warn",
      title: "Reviews are waiting for you",
      detail: "They stay hidden from the shop until you approve them.",
      href: "#/reviews", action: "Review them",
    });
  }

  // Worst first.
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "bad" ? -1 : 1));
}
