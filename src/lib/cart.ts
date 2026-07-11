// Simple localStorage-backed cart. No cart table in the DB by design —
// the cart only becomes a real `orders` row once checkout calls create-order.

export interface CartItem {
  product_id: string;
  name: string;
  slug?: string;
  sku?: string;
  size_label?: string | null;
  color_name?: string | null;
  unit_price: number;
  unit_mrp?: number;
  image_url?: string | null;
  quantity: number;
}

const CART_KEY = "sunflora_cart_v1";

function safeParse(json: string | null): CartItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lineKey(item: Pick<CartItem, "product_id" | "size_label" | "color_name">) {
  return `${item.product_id}::${item.size_label || ""}::${item.color_name || ""}`;
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(CART_KEY));
}

function saveCart(items: CartItem[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("cart:updated", { detail: { items } }));
}

export function addToCart(item: CartItem) {
  const items = getCart();
  const key = lineKey(item);
  const existing = items.find((i) => lineKey(i) === key);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    items.push(item);
  }
  saveCart(items);
  return items;
}

export function updateQuantity(
  item: Pick<CartItem, "product_id" | "size_label" | "color_name">,
  quantity: number,
) {
  let items = getCart();
  const key = lineKey(item);
  if (quantity <= 0) {
    items = items.filter((i) => lineKey(i) !== key);
  } else {
    const existing = items.find((i) => lineKey(i) === key);
    if (existing) existing.quantity = quantity;
  }
  saveCart(items);
  return items;
}

export function removeFromCart(
  item: Pick<CartItem, "product_id" | "size_label" | "color_name">,
) {
  return updateQuantity(item, 0);
}

export function clearCart() {
  saveCart([]);
}

export function cartCount(): number {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

export function cartSubtotal(): number {
  return getCart().reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}
