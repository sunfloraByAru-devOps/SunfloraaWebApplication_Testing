/* All database access for the admin, in one place.
   Reuses the storefront's configured client and image helper. */

import { supabase } from "../supabase";
import { getImageUrl } from "../images";
import { uploadPhoto, removePhotoObjects, suggestAltText } from "./images";

export const PRODUCT_BUCKET = "product-images";

/* ---------- session / admin check ---------- */

export type AdminSession = { email: string; name: string };

/** Signed in AND profiles.role = 'admin'. Returns null otherwise. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || profile.role !== "admin") return null;
  return { email: user.email ?? "", name: profile.full_name || user.email || "" };
}

export async function signOut() { await supabase.auth.signOut(); }

/* ---------- categories ---------- */

export type Category = {
  id: string; name: string; slug: string; description: string | null;
  is_active: boolean; display_order: number | null;
};

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, is_active, display_order")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveCategory(id: string | null, patch: Partial<Category>) {
  const q = id
    ? supabase.from("categories").update(patch).eq("id", id)
    : supabase.from("categories").insert(patch);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- products ---------- */

export type ProductRow = {
  id: string; name: string; tagline: string | null; description: string | null;
  category_id: string | null; base_price: number | null; base_mrp: number | null;
  tag: string | null; is_new: boolean; in_stock: boolean; is_active: boolean;
  display_order: number | null; sku: string | null; brand: string | null;
};

export type ProductListItem = ProductRow & {
  primary_image_path: string | null;
  category_name: string | null;
};

/** List for the products screen — reads the storefront's convenience view. */
export async function listProducts(): Promise<ProductListItem[]> {
  const { data, error } = await supabase
    .from("products_with_image")
    .select("id, name, tagline, description, category_id, base_price, base_mrp, tag," +
            " is_new, in_stock, is_active, display_order, sku, brand," +
            " primary_image_path, category_name")
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as ProductListItem[];
}

export async function getProduct(id: string): Promise<ProductRow> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, tagline, description, category_id, base_price, base_mrp, tag," +
            " is_new, in_stock, is_active, display_order, sku, brand")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ProductRow;
}

/** Inline toggles on the list — save immediately. */
export async function setProductFlag(id: string, field: "in_stock" | "is_active", value: boolean) {
  const { error } = await supabase.from("products").update({ [field]: value }).eq("id", id);
  if (error) throw error;
}

export async function createProduct(patch: Partial<ProductRow>): Promise<string> {
  const { data, error } = await supabase.from("products").insert(patch).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateProduct(id: string, patch: Partial<ProductRow>) {
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- product photos ----------
   The storefront renders product_images.storage_path through getImageUrl().
   Aru never sees a path: she drops a file, we upload it and record the key. */

export type Photo = {
  id: string; storage_path: string; alt_text: string | null;
  display_order: number | null; is_primary: boolean;
};

export async function listPhotos(productId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("id, storage_path, alt_text, display_order, is_primary")
    .eq("product_id", productId)
    .order("display_order", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export function photoUrl(path: string | null | undefined) { return getImageUrl(path, PRODUCT_BUCKET); }

/** Small image for grids and lists; falls back to the full one for legacy photos. */
export { thumbUrl as photoThumbUrl, prettyBytes } from "./images";

/** Shrink, convert and upload, then record it. Returns the new photo row.
 *  Every photo gets a description written for it — the storefront and screen
 *  readers both rely on alt text, and a blank one is a regression. */
export async function addPhoto(
  productId: string, file: File, order: number, makePrimary: boolean, productName = "",
): Promise<Photo & { savedBytes: number }> {
  const uploaded = await uploadPhoto(productId, file);

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      storage_path: uploaded.key,
      display_order: order,
      is_primary: makePrimary,
      alt_text: suggestAltText(productName, order),
    })
    .select("id, storage_path, alt_text, display_order, is_primary")
    .single();

  if (error) {
    // Don't leave orphan objects behind if the row could not be written.
    await removePhotoObjects(uploaded.key);
    throw error;
  }
  return { ...(data as Photo), savedBytes: uploaded.originalBytes - uploaded.bytes };
}

export async function setPhotoAlt(id: string, altText: string) {
  const { error } = await supabase.from("product_images").update({ alt_text: altText }).eq("id", id);
  if (error) throw error;
}

export async function deletePhoto(photo: Photo) {
  const { error } = await supabase.from("product_images").delete().eq("id", photo.id);
  if (error) throw error;
  // Best effort — a leftover file is harmless, a broken row is not.
  await removePhotoObjects(photo.storage_path);
}

/** Persist the on-screen order. */
export async function savePhotoOrder(photos: Photo[]) {
  for (let i = 0; i < photos.length; i++) {
    if (photos[i].display_order === i) continue;
    const { error } = await supabase.from("product_images").update({ display_order: i }).eq("id", photos[i].id);
    if (error) throw error;
    photos[i].display_order = i;
  }
}

/** Set one photo as the main one.
 *  The database's ensure_single_primary_image trigger clears the others, so
 *  doing it here as well would be a redundant second round trip. */
export async function setPrimaryPhoto(_productId: string, photoId: string) {
  const { error } = await supabase.from("product_images").update({ is_primary: true }).eq("id", photoId);
  if (error) throw error;
}

/* ---------- product options (sizes / colours / details / includes) ---------- */

export type OptionSpec = { table: string; fields: string; orderCol: string };

export const OPTION_TABLES = {
  sizes:    { table: "product_sizes",    fields: "id, label, cm_description, price, mrp, display_order", orderCol: "display_order" },
  colors:   { table: "product_colors",   fields: "id, name, hex, has_border, display_order",             orderCol: "display_order" },
  details:  { table: "product_details",  fields: "id, label, value, display_order",                      orderCol: "display_order" },
  includes: { table: "product_includes", fields: "id, item, display_order",                              orderCol: "display_order" },
} as const;

export async function listOptions(kind: keyof typeof OPTION_TABLES, productId: string): Promise<any[]> {
  const spec = OPTION_TABLES[kind];
  const { data, error } = await supabase
    .from(spec.table).select(spec.fields)
    .eq("product_id", productId)
    .order(spec.orderCol, { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function replaceOptions(kind: keyof typeof OPTION_TABLES, productId: string, rows: any[]) {
  const spec = OPTION_TABLES[kind];
  const { error: delErr } = await supabase.from(spec.table).delete().eq("product_id", productId);
  if (delErr) throw delErr;
  if (!rows.length) return;
  const payload = rows.map((r, i) => ({ ...r, product_id: productId, display_order: i }));
  payload.forEach((r) => delete (r as any).id);
  const { error } = await supabase.from(spec.table).insert(payload);
  if (error) throw error;
}

/* ---------- reviews ---------- */

export type Review = {
  id: string; product_id: string | null; stars: number; title: string | null;
  body: string | null; guest_name: string | null; is_approved: boolean;
  is_verified: boolean; created_at: string;
};

export async function listReviews(onlyPending = false): Promise<Review[]> {
  let q = supabase
    .from("reviews")
    .select("id, product_id, stars, title, body, guest_name, is_approved, is_verified, created_at")
    .order("created_at", { ascending: false });
  if (onlyPending) q = q.eq("is_approved", false);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function setReviewApproved(id: string, approved: boolean) {
  const { error } = await supabase.from("reviews").update({ is_approved: approved }).eq("id", id);
  if (error) throw error;
}

export async function deleteReview(id: string) {
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- counts for the Today screen ---------- */

export type TodayCounts = {
  newOrders: number; customRequests: number; unreadMessages: number;
  pendingReviews: number; outOfStock: number; photoIssues: number;
};

async function countOf(table: string, apply: (q: any) => any): Promise<number> {
  try {
    const { count, error } = await apply(supabase.from(table).select("*", { count: "exact", head: true }));
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

export async function getTodayCounts(): Promise<TodayCounts> {
  const [newOrders, customRequests, unreadMessages, pendingReviews, outOfStock, photoIssues] =
    await Promise.all([
      countOf("orders", (q) => q.in("status", ["pending", "confirmed", "crafting", "ready_to_ship"])),
      countOf("custom_orders", (q) => q.in("status", ["received", "reviewing"])),
      countOf("contact_messages", (q) => q.in("status", ["new", "read"])),
      countOf("reviews", (q) => q.eq("is_approved", false)),
      countOf("products", (q) => q.eq("in_stock", false).eq("is_active", true)),
      // Live in the shop with no main photo - customers land on an empty gallery.
      countOf("products_with_image", (q) => q.eq("is_active", true).is("primary_image_path", null)),
    ]);
  return { newOrders, customRequests, unreadMessages, pendingReviews, outOfStock, photoIssues };
}

/* ---------- orders (Part B) ----------
   A placed order is mostly a record of what happened. Aru can move it through
   its statuses, add tracking, write a private note, and - because the shop
   asked for it - revise the items. Revising goes through admin_revise_order so
   totals are recalculated, the change is recorded, and the customer is told. */

export const ORDER_STATUSES = [
  "pending", "confirmed", "crafting", "ready_to_ship", "shipped",
  "out_for_delivery", "delivered", "cancelled",
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

/** Shop language, not database language. */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Not paid yet",
  confirmed: "Paid — to make",
  crafting: "Being made",
  ready_to_ship: "Ready to post",
  shipped: "Posted",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment", paid: "Paid", failed: "Payment failed", refunded: "Refunded",
};

export type OrderSummary = {
  id: string; order_number: string; status: string; payment_status: string | null;
  total: number | null; created_at: string; guest_name: string | null;
};

export async function listOrders(): Promise<OrderSummary[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, total, created_at, guest_name")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OrderSummary[];
}

export type OrderItem = {
  id: string; product_id: string | null; product_name: string | null;
  product_sku: string | null; size_label: string | null; color_name: string | null;
  quantity: number; unit_price: number; unit_mrp: number | null; image_url: string | null;
};

export type OrderDetail = {
  order: any; items: OrderItem[]; history: any[];
  address: any | null; customerEmail: string | null; notifications: any[];
};

export async function getOrder(id: string): Promise<OrderDetail> {
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).single();
  if (error) throw error;

  const [items, history, notifications] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("created_at").then((r) => r.data ?? []),
    supabase.from("order_status_history").select("*").eq("order_id", id)
      .order("created_at", { ascending: false }).then((r) => r.data ?? []),
    supabase.from("order_notifications").select("*").eq("order_id", id)
      .order("created_at", { ascending: false }).then((r) => r.data ?? []),
  ]);

  let address: any = null;
  if (order.user_id) {
    const { data } = await supabase.from("addresses").select("*")
      .eq("user_id", order.user_id).order("is_default", { ascending: false }).limit(1);
    address = data?.[0] ?? null;
  }

  return {
    order, items: items as OrderItem[], history, notifications,
    address, customerEmail: order.guest_email ?? null,
  };
}

/** Status change appends to the history — it never overwrites it.
 *  The append is done by the database's own log_order_status_change trigger;
 *  this RPC just carries the note and the author into that row. Inserting the
 *  history row from here as well would duplicate both the timeline entry and
 *  the customer's email. */
export async function changeOrderStatus(id: string, status: string, note: string | null) {
  const { error } = await supabase.rpc("admin_set_order_status", {
    p_order_id: id, p_status: status, p_note: note || null,
  });
  if (error) throw error;
}

export async function saveOrderFulfilment(
  id: string, patch: { tracking_number?: string | null; courier?: string | null; notes?: string | null },
) {
  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) throw error;
}

/** Revise the items. Recalculates totals, records the change, queues the email. */
export async function reviseOrder(orderId: string, items: any[], reason: string) {
  const { data, error } = await supabase.rpc("admin_revise_order", {
    p_order_id: orderId, p_items: items, p_reason: reason || null,
  });
  if (error) throw error;

  // Delivery is best effort: the revision and its queued email are already
  // committed, so a failure here means "not sent yet", never "lost".
  let emailSent = false, emailProblem: string | null = null;
  try {
    const { data: res, error: fnErr } = await supabase.functions
      .invoke("send-order-revision", { body: { order_id: orderId } });
    if (fnErr) emailProblem = "queued";
    else if (res && typeof res === "object") {
      emailSent = (res as any).sent > 0;
      if ((res as any).failed > 0) emailProblem = "failed";
    }
  } catch { emailProblem = "queued"; }

  return { ...(data as any), emailSent, emailProblem };
}

/* ---------- custom orders ---------- */

export const CUSTOM_STATUSES = [
  "received", "reviewing", "quoted", "accepted", "crafting", "shipped", "delivered", "cancelled",
] as const;

export const CUSTOM_STATUS_LABEL: Record<string, string> = {
  received: "Just came in",
  reviewing: "Looking at it",
  quoted: "Price sent",
  accepted: "They said yes",
  crafting: "Being made",
  shipped: "Posted",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** The states that still need a reply from Aru. */
export const CUSTOM_NEEDS_REPLY = ["received", "reviewing"];

export type CustomOrder = {
  id: string; ref_number: string; creation_name: string; size_label: string;
  email: string; phone: string | null; description: string | null;
  inspiration_path: string | null; status: string; quoted_price: number | null;
  admin_notes: string | null; created_at: string; updated_at: string;
};

export async function listCustomOrders(): Promise<CustomOrder[]> {
  const { data, error } = await supabase
    .from("custom_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CustomOrder[];
}

export async function getCustomOrder(id: string) {
  const { data, error } = await supabase.from("custom_orders").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: history } = await supabase
    .from("custom_order_status_history").select("*")
    .eq("custom_order_id", id).order("created_at", { ascending: false });
  return { request: data as any, history: history ?? [] };
}

/** The inspiration image lives in a private bucket — never expose the path. */
export async function inspirationUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("custom-order-uploads").createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function setCustomOrderStatus(
  id: string, status: string,
  opts: { note?: string | null; quotedPrice?: number | null; adminNotes?: string | null } = {},
) {
  const { error } = await supabase.rpc("admin_set_custom_order_status", {
    p_id: id, p_status: status,
    p_note: opts.note || null,
    p_quoted_price: opts.quotedPrice ?? null,
    p_admin_notes: opts.adminNotes ?? null,
  });
  if (error) throw error;
}

/* ---------- customers (read only) ---------- */

export type Customer = {
  id: string; full_name: string | null; phone: string | null;
  created_at: string; orderCount: number; lastOrder: string | null; totalSpent: number;
};

export async function listCustomers(): Promise<Customer[]> {
  const { data: profiles, error } = await supabase
    .from("profiles").select("id, full_name, phone, created_at, role")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: orders } = await supabase
    .from("orders").select("user_id, total, created_at, status");

  const byUser = new Map<string, { n: number; last: string | null; spent: number }>();
  for (const o of orders ?? []) {
    if (!o.user_id) continue;
    const e = byUser.get(o.user_id) ?? { n: 0, last: null, spent: 0 };
    e.n++;
    if (o.status !== "cancelled") e.spent += Number(o.total ?? 0);
    if (!e.last || (o.created_at ?? "") > e.last) e.last = o.created_at;
    byUser.set(o.user_id, e);
  }

  return (profiles ?? []).map((p: any) => {
    const e = byUser.get(p.id);
    return {
      id: p.id, full_name: p.full_name, phone: p.phone, created_at: p.created_at,
      orderCount: e?.n ?? 0, lastOrder: e?.last ?? null, totalSpent: e?.spent ?? 0,
    };
  });
}

export async function getCustomer(id: string) {
  const [{ data: profile }, { data: addresses }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("addresses").select("*").eq("user_id", id).order("is_default", { ascending: false }),
    supabase.from("orders")
      .select("id, order_number, status, total, created_at")
      .eq("user_id", id).order("created_at", { ascending: false }),
  ]);
  return { profile, addresses: addresses ?? [], orders: orders ?? [] };
}

/* ---------- messages & newsletter ---------- */

export const MESSAGE_STATUSES = ["new", "read", "replied", "closed"] as const;
export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  new: "New", read: "Read", replied: "Replied", closed: "Done",
};
export const TOPIC_LABEL: Record<string, string> = {
  custom: "Custom order", partner: "Partnership", journey: "Their story",
  support: "Help needed", feedback: "Feedback", wrong: "Something wrong",
};

export async function listMessages() {
  const { data, error } = await supabase
    .from("contact_messages").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function setMessageStatus(id: string, status: string) {
  const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function listSubscribers() {
  const { data, error } = await supabase
    .from("newsletter_subscribers").select("id, email, is_active");
  if (error) throw error;
  return data ?? [];
}

/* ---------- site content ---------- */

export type ContentSpec = {
  table: string; title: string; singular: string;
  fields: { key: string; label: string; type?: "text" | "textarea" | "number" | "toggle"; hint?: string }[];
};

export const CONTENT: Record<string, ContentSpec> = {
  faqs: {
    table: "faqs", title: "Questions & answers", singular: "question",
    fields: [
      { key: "question", label: "Question" },
      { key: "answer", label: "Answer", type: "textarea" },
      { key: "is_active", label: "Show on site", type: "toggle" },
    ],
  },
  testimonials: {
    table: "testimonials", title: "Customer quotes", singular: "quote",
    fields: [
      { key: "author_name", label: "Who said it" },
      { key: "author_tag", label: "Where they're from", hint: "Optional" },
      { key: "quote", label: "What they said", type: "textarea" },
      { key: "stars", label: "Stars out of 5", type: "number" },
      { key: "is_active", label: "Show on site", type: "toggle" },
    ],
  },
};

export async function listContent(kind: keyof typeof CONTENT) {
  const spec = CONTENT[kind];
  const { data, error } = await supabase
    .from(spec.table).select("*")
    .order("display_order", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveContent(kind: keyof typeof CONTENT, id: string | null, patch: any) {
  const spec = CONTENT[kind];
  const q = id
    ? supabase.from(spec.table).update(patch).eq("id", id)
    : supabase.from(spec.table).insert(patch);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteContent(kind: keyof typeof CONTENT, id: string) {
  const { error } = await supabase.from(CONTENT[kind].table).delete().eq("id", id);
  if (error) throw error;
}

export async function listSettings() {
  const { data, error } = await supabase.from("site_settings").select("*").order("label");
  if (error) throw error;
  return data ?? [];
}

export async function saveSetting(key: string, value: string) {
  const { error } = await supabase.from("site_settings").update({ value }).eq("key", key);
  if (error) throw error;
}

/* ---------- photo overview (the Photos screen) ---------- */

export type PhotoOverviewItem = {
  id: string; storage_path: string; alt_text: string | null;
  is_primary: boolean; display_order: number | null;
  product_id: string; productName: string; productActive: boolean;
};

export type PhotoOverview = {
  photos: PhotoOverviewItem[];
  productsWithNone: { id: string; name: string; is_active: boolean }[];
};

export async function getPhotoOverview(): Promise<PhotoOverview> {
  const [{ data: rows, error }, { data: products }] = await Promise.all([
    supabase.from("product_images")
      .select("id, storage_path, alt_text, is_primary, display_order, product_id," +
              " products(name, is_active)")
      .order("display_order", { ascending: true, nullsFirst: false }),
    supabase.from("products").select("id, name, is_active"),
  ]);
  if (error) throw error;

  const photos: PhotoOverviewItem[] = (rows ?? []).map((r: any) => ({
    id: r.id, storage_path: r.storage_path, alt_text: r.alt_text,
    is_primary: r.is_primary, display_order: r.display_order,
    product_id: r.product_id,
    productName: r.products?.name ?? "Unknown product",
    productActive: !!r.products?.is_active,
  }));

  const withPhotos = new Set(photos.map((p) => p.product_id));
  const productsWithNone = (products ?? [])
    .filter((p: any) => !withPhotos.has(p.id))
    .map((p: any) => ({ id: p.id, name: p.name, is_active: p.is_active }));

  return { photos, productsWithNone };
}
