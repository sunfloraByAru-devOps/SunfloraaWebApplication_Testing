import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://btmwojmtkeadxdzlfdqi.supabase.co",
  "sb_publishable_7PhnNf9lrX5iGNUMRTXL8Q_Ex2RpyIV"
);

async function test() {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      *,
      product_images(storage_path, alt_text, display_order, is_primary),
      product_sizes(label, cm_description, price, mrp, display_order),
      product_colors(name, hex, has_border, display_order),
      product_details(label, value, display_order),
      product_includes(item, display_order),
      customer_insights(label, display_order,
        customer_insight_options(text, pct, display_order)
      ),
      reviews(id, stars, title, body, guest_name,
        profiles!user_id(full_name),
        is_verified, created_at, helpful_count, unhelpful_count, is_approved,
        review_photos(storage_path)
      )
    `
    )
    .eq("is_active", true);

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Success! Fetched products count:", data.length);
    if (data.length > 0) {
      console.log("First product sample reviews:", JSON.stringify(data[0].reviews, null, 2));
    }
  }
}

test();
