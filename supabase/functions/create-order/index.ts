import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handlePreflight, json } from "../_shared/cors.ts";
import { supabaseAdmin, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";

interface CartItem {
  product_id: string;
  size_label?: string | null;
  color_name?: string | null;
  quantity: number;
}

interface OrderPayload {
  items: CartItem[];
  email: string;
  phone?: string;
  name?: string;
  shipping: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  notes?: string;
  save_address?: boolean;
}

/* Delivery charge comes from the dashboard's "Shop details" screen.
 *
 * These used to be hardcoded as 999 / 79 here while checkout.astro showed the
 * customer 0 / 0, so the server quietly added Rs 79 to every order total after
 * the checkout page had already quoted a figure without it. Three paid orders
 * were each charged Rs 79 more than the page displayed.
 *
 * Both numbers now come from one place. If the settings cannot be read we fall
 * back to free delivery rather than to a charge - erring toward the figure the
 * customer was actually shown. */
async function getShippingConfig(): Promise<{ fee: number; freeAbove: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("key, value")
      .in("key", ["shipping_fee_domestic", "free_shipping_above"]);
    if (error || !data) return { fee: 0, freeAbove: 0 };
    const map = new Map(data.map((r: { key: string; value: string | null }) => [r.key, r.value]));
    const num = (k: string) => {
      const v = Number(map.get(k));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    };
    return { fee: num("shipping_fee_domestic"), freeAbove: num("free_shipping_above") };
  } catch {
    return { fee: 0, freeAbove: 0 };
  }
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: OrderPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!payload.items || payload.items.length === 0) {
    return json({ error: "Cart is empty" }, 400);
  }
  if (!payload.email || !isValidEmail(payload.email)) {
    return json({ error: "A valid email address is required" }, 400);
  }
  const s = payload.shipping;
  if (!s || !s.line1 || !s.city || !s.state || !s.pincode) {
    return json({ error: "Complete shipping address is required" }, 400);
  }
  if (!/^\d{6}$/.test(s.pincode)) {
    return json({ error: "Pincode must be 6 digits" }, 400);
  }

  const user = await getUserFromAuthHeader(req);

  // --- Server-side price + product validation (never trust client prices) ---
  const productIds = [...new Set(payload.items.map((i) => i.product_id))];
  const { data: products, error: productsErr } = await supabaseAdmin
    .from("products")
    .select(
      `id, name, sku, base_price, base_mrp, is_active,
       product_sizes(label, price, mrp),
       product_images(storage_path, is_primary, display_order)`,
    )
    .in("id", productIds);

  if (productsErr) {
    console.error(productsErr);
    return json({ error: "Could not validate products" }, 500);
  }

  const productMap = new Map((products || []).map((p: any) => [p.id, p]));

  const orderItems: any[] = [];
  let subtotal = 0;

  for (const item of payload.items) {
    const product = productMap.get(item.product_id);
    if (!product || !product.is_active) {
      return json({ error: `Product ${item.product_id} is not available` }, 400);
    }
    const qty = Math.max(1, Math.min(50, Math.floor(item.quantity || 1)));

    let unitPrice = product.base_price;
    let unitMrp = product.base_mrp;
    if (item.size_label) {
      const sizeMatch = (product.product_sizes || []).find(
        (sz: any) => sz.label === item.size_label,
      );
      if (sizeMatch) {
        unitPrice = sizeMatch.price;
        unitMrp = sizeMatch.mrp;
      }
    }

    const primaryImage =
      (product.product_images || []).find((img: any) => img.is_primary) ||
      (product.product_images || []).sort(
        (a: any, b: any) => a.display_order - b.display_order,
      )[0];
    const imageUrl = primaryImage
      ? supabaseAdmin.storage
          .from("product-images")
          .getPublicUrl(primaryImage.storage_path).data.publicUrl
      : null;

    subtotal += unitPrice * qty;

    orderItems.push({
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      size_label: item.size_label || null,
      color_name: item.color_name || null,
      quantity: qty,
      unit_price: unitPrice,
      unit_mrp: unitMrp,
      image_url: imageUrl,
    });
  }

  const shippingCfg = await getShippingConfig();
  const shippingFee =
    shippingCfg.fee === 0 || subtotal >= shippingCfg.freeAbove ? 0 : shippingCfg.fee;
  const discount = 0;
  const total = subtotal + shippingFee - discount;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      user_id: user?.id ?? null,
      guest_name: payload.name || null,
      guest_email: payload.email,
      guest_phone: payload.phone || null,
      shipping_line1: s.line1,
      shipping_line2: s.line2 || null,
      shipping_city: s.city,
      shipping_state: s.state,
      shipping_pincode: s.pincode,
      shipping_country: s.country || "India",
      subtotal,
      shipping_fee: shippingFee,
      discount,
      total,
      status: "pending",
      payment_status: "pending",
      payment_method: "razorpay",
      notes: payload.notes || null,
    })
    .select()
    .single();

  if (orderErr || !order) {
    console.error(orderErr);
    return json({ error: "Could not create order" }, 500);
  }

  const itemsToInsert = orderItems.map((it) => ({ ...it, order_id: order.id }));
  const { error: itemsErr } = await supabaseAdmin
    .from("order_items")
    .insert(itemsToInsert);

  if (itemsErr) {
    console.error(itemsErr);
    // Roll back the order so we don't leave an empty, orphaned order behind.
    await supabaseAdmin.from("orders").delete().eq("id", order.id);
    return json({ error: "Could not create order items" }, 500);
  }

  // Optionally save this as an address for a logged-in user
  if (user && payload.save_address) {
    await supabaseAdmin.from("addresses").insert({
      user_id: user.id,
      label: "Checkout address",
      line1: s.line1,
      line2: s.line2 || null,
      city: s.city,
      state: s.state,
      pincode: s.pincode,
      country: s.country || "India",
      is_default: false,
    });
  }

  return json({
    order_id: order.id,
    order_number: order.order_number,
    email: order.guest_email,
    total: order.total,
    subtotal: order.subtotal,
    shipping_fee: order.shipping_fee,
  });
});
