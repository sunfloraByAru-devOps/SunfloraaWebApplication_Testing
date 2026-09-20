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

export type PublishState = {
  pending: boolean;
  changedAt: string | null;
  /** When the live site was last rebuilt, as best we can tell. */
  publishedAt: string | null;
  /** A publish is queued or running right now. */
  inFlight: boolean;
  /** The run to poll, if one is going. */
  runId: string | null;
};

/* The storefront is a build-time snapshot, so edits are not live until it is
   rebuilt.

   This used to compare against BUILT_AT, the timestamp baked into the admin
   page itself. That is wrong in a way that is worse than it sounds: after a
   successful publish the already-open tab still holds the OLD stamp, so the
   banner keeps insisting the changes are not live. Aru publishes again, sees
   the same message, and publishes again — a publish storm caused by a
   correctness bug rather than impatience. The last successful run is the only
   honest answer, and BUILT_AT is now just the fallback for a shop that has
   never used the button.

   Note the comparison is against requested_at, not finished_at. A build is not
   an atomic snapshot of the database: every page opens its own connection and
   queries independently, so an edit made while a build is running lands on
   some pages and not others. Counting it as unpublished is the truthful
   reading. */
export async function getPublishState(builtAt: string): Promise<PublishState> {
  const [changedAt, lastRun] = await Promise.all([
    getContentChangedAt(),
    latestRun(),
  ]);

  const inFlight = !!lastRun && (lastRun.status === "queued" || lastRun.status === "building");

  const lastSuccessAt = await lastSuccessfulRunAt();
  const publishedAt = lastSuccessAt ?? (builtAt || null);

  const pending =
    !!changedAt && !!publishedAt && new Date(changedAt) > new Date(publishedAt);

  return {
    pending,
    changedAt,
    publishedAt,
    inFlight,
    runId: inFlight ? lastRun!.id : null,
  };
}

async function latestRun(): Promise<{ id: string; status: string } | null> {
  const { data, error } = await supabase
    .from("publish_runs").select("id, status")
    .order("requested_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as { id: string; status: string };
}

/** requested_at of the most recent successful publish — see the note above on
 *  why this is not finished_at. */
async function lastSuccessfulRunAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from("publish_runs").select("requested_at")
    .eq("status", "success")
    .order("requested_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data.requested_at ?? null;
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

  /* ---- the home page ----
     These are the failures that stop the site building rather than merely
     looking wrong. Astro downloads every one of these pictures while rendering,
     so a home page category with no photo, or a featured product whose photo
     was deleted, turns the next Publish into a failed build. Catching them here
     turns a failed publish into a two-minute fix. */
  await addHomePageIssues(issues);


  // Worst first.
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "bad" ? -1 : 1));
}

async function addHomePageIssues(issues: Issue[]) {
  const [cats, siteImages, picks] = await Promise.all([
    supabase.from("categories")
      .select("id, name, image_path, show_on_home").eq("show_on_home", true),
    supabase.from("site_images")
      .select("id, key, alt").eq("is_active", true),
    supabase.from("products")
      .select("id, name, home_section, is_active, product_images(storage_path, width, height)")
      .not("home_section", "is", null),
  ]);

  for (const c of cats.data ?? []) {
    if (!c.image_path) {
      issues.push({
        id: `cat-nophoto-${c.id}`, severity: "bad",
        title: `“${c.name}” is on the home page with no photo`,
        detail: "The card will be a gap, and the site will not publish.",
        href: "#/categories", action: "Add a photo",
      });
    }
  }

  const GROUP_NAMES: Record<string, string> = {
    community_wall: "the community wall",
    founder_portrait: "your photo",
  };

  const byGroup = new Map<string, number>();
  for (const img of siteImages.data ?? []) {
    byGroup.set(img.key, (byGroup.get(img.key) ?? 0) + 1);
    if (!img.alt || !String(img.alt).trim()) {
      issues.push({
        id: `siteimg-noalt-${img.id}`, severity: "warn",
        title: `A photo on ${GROUP_NAMES[img.key] ?? "the home page"} has no description`,
        detail: "Screen readers and Google both rely on it.",
        href: `#/site-images/${img.key}`, action: "Describe it",
      });
    }
  }

  for (const key of Object.keys(GROUP_NAMES)) {
    if ((byGroup.get(key) ?? 0) === 0) {
      issues.push({
        id: `siteimg-empty-${key}`, severity: "bad",
        title: `There is no photo for ${GROUP_NAMES[key]}`,
        detail: "The home page will not publish until there is one.",
        href: `#/site-images/${key}`, action: "Add a photo",
      });
    }
  }

  const SECTION_NAMES: Record<string, string> = {
    best_sellers: "Most Loved",
    new_arrivals: "Latest Collection",
  };
  const counts: Record<string, number> = { best_sellers: 0, new_arrivals: 0 };

  for (const p of (picks.data ?? []) as any[]) {
    if (!p.is_active) continue;
    const imgs: any[] = p.product_images ?? [];
    counts[p.home_section] = (counts[p.home_section] ?? 0) + 1;

    if (!imgs.length) {
      issues.push({
        id: `pick-nophoto-${p.id}`, severity: "bad",
        title: `“${p.name}” is on the home page with no photo`,
        detail: "The site will not publish while it is featured without one.",
        href: `#/products/${p.id}`, action: "Add photos",
      });
    } else if (!imgs.some((i) => i.width && i.height)) {
      issues.push({
        id: `pick-nodims-${p.id}`, severity: "bad",
        title: `“${p.name}” has a photo the site cannot measure`,
        detail: "Re-upload it, or the next publish will fail.",
        href: `#/products/${p.id}`, action: "Open",
      });
    }
  }

  for (const [section, label] of Object.entries(SECTION_NAMES)) {
    const n = counts[section] ?? 0;
    if (n === 0) {
      issues.push({
        id: `pick-empty-${section}`, severity: "bad",
        title: `Nothing is chosen for “${label}”`,
        detail: "That row on the home page is empty, and the site will not publish.",
        href: "#/products", action: "Choose products",
      });
    } else if (n < 3) {
      issues.push({
        id: `pick-thin-${section}`, severity: "warn",
        title: `“${label}” has only ${n} product${n === 1 ? "" : "s"}`,
        detail: "The row looks bare with fewer than three.",
        href: "#/products", action: "Add more",
      });
    }
  }
}
