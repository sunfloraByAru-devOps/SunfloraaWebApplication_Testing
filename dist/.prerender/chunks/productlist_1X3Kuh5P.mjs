import { c as createComponent, $ as $$Layout } from './Layout_SblD8Eqv.mjs';
import 'piccolore';
import { r as renderComponent, t as renderTemplate, j as addAttribute, p as maybeRenderHead } from './prerender_DGZJpN45.mjs';
import { $ as $$Image } from './_astro_assets_z32ZoNj-.mjs';
import { $ as $$Nav } from './Nav_B_ynG1ku.mjs';
import { H as HERO, b as SUN_CLOSEUP, a as STARS, S as SPIDEY } from './spiderman_BvNRCbmt.mjs';
import { createClient } from '@supabase/supabase-js';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Productlist = createComponent(async ($$result, $$props, $$slots) => {
  const supabase = createClient(
    "https://btmwojmtkeadxdzlfdqi.supabase.co",
    "sb_publishable_7PhnNf9lrX5iGNUMRTXL8Q_Ex2RpyIV"
  );
  const { data: products } = await supabase.from("products_with_image").select(
    `
    id, name, category_name, base_price, base_mrp,
    avg_rating, review_count, tag, is_new, in_stock,
    primary_image_path
  `
  ).eq("is_active", true).order("display_order");
  const allProducts = products?.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category_name,
    price: p.base_price,
    mrp: p.base_mrp,
    rating: p.avg_rating,
    reviews: p.review_count,
    tag: p.tag,
    img: p.primary_image_path ? supabase.storage.from("product-images").getPublicUrl(p.primary_image_path).data.publicUrl : HERO.src,
    isNew: p.is_new,
    inStock: p.in_stock
  })) || [];
  const recommendations = [
    {
      id: 9,
      name: "Sunshine Bouquet",
      category: "Bouquets",
      price: 1299,
      mrp: 1699,
      rating: 4.9,
      reviews: 22,
      tag: "Top Rated",
      img: SUN_CLOSEUP
    },
    {
      id: 10,
      name: "Galaxy Star Mobile",
      category: "Wall Hangings",
      price: 599,
      mrp: 799,
      rating: 4.7,
      reviews: 14,
      tag: "New",
      img: STARS
    },
    {
      id: 11,
      name: "Spidey + Dino Duo",
      category: "Keychains",
      price: 499,
      mrp: 649,
      rating: 4.8,
      reviews: 19,
      tag: "Bundle",
      img: SPIDEY
    },
    {
      id: 12,
      name: "Sunrise Amigurumi",
      category: "Amigurumi",
      price: 699,
      mrp: 899,
      rating: 5,
      reviews: 11,
      tag: "Fan Fav",
      img: HERO
    }
  ];
  const categories = [
    "All",
    "Amigurumi",
    "Keychains",
    "Flower Stems",
    "Wall Hangings",
    "Bouquets",
    "Customs"
  ];
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Shop — Sunflora Handmade Crochet", "description": "Browse our full collection of handmade crochet pieces — amigurumi, keychains, florals and custom orders.", "data-astro-cid-3gw4p3li": true }, { "default": async ($$result2) => renderTemplate(_a || (_a = __template(["   ", "  ", '<div class="shop-header" data-astro-cid-3gw4p3li> <div class="shop-header-inner" data-astro-cid-3gw4p3li> <div data-astro-cid-3gw4p3li> <div class="shop-eyebrow" data-astro-cid-3gw4p3li>Give All You Need</div> <h1 class="shop-title" data-astro-cid-3gw4p3li>\nEverything<br data-astro-cid-3gw4p3li>we <em data-astro-cid-3gw4p3li>make.</em> </h1> </div> <div class="shop-meta" data-astro-cid-3gw4p3li> <span data-astro-cid-3gw4p3li>', '</span> pieces available\n</div> </div> </div>  <div class="category-bar-wrap" data-astro-cid-3gw4p3li> <div class="category-bar" id="category-bar" role="tablist" aria-label="Product categories" data-astro-cid-3gw4p3li> ', ' </div> </div>  <div class="controls-row" data-astro-cid-3gw4p3li> <p class="results-label" data-astro-cid-3gw4p3li>\nShowing <strong id="result-count" data-astro-cid-3gw4p3li>', '</strong> pieces\n</p> <div class="sort-wrap" data-astro-cid-3gw4p3li> <span class="sort-label" data-astro-cid-3gw4p3li>Sort</span> <select class="sort-select" id="sort-select" aria-label="Sort products" data-astro-cid-3gw4p3li> <option value="default" data-astro-cid-3gw4p3li>Featured</option> <option value="price-asc" data-astro-cid-3gw4p3li>Price: Low → High</option> <option value="price-desc" data-astro-cid-3gw4p3li>Price: High → Low</option> <option value="rating" data-astro-cid-3gw4p3li>Top Rated</option> <option value="new" data-astro-cid-3gw4p3li>Newest First</option> </select> </div> </div>  <section class="products-section" aria-label="Products" data-astro-cid-3gw4p3li> <div class="product-grid" id="product-grid" data-astro-cid-3gw4p3li> ', ' </div> <!-- Empty state --> <div class="empty-state" id="empty-state" data-astro-cid-3gw4p3li> <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" data-astro-cid-3gw4p3li><path d="M3 3l1.88 5.76a1 1 0 0 0 .95.69h14.34a1 1 0 0 0 .95-.69L23 3" data-astro-cid-3gw4p3li></path><path d="M9 14v1a3 3 0 0 0 6 0v-1" data-astro-cid-3gw4p3li></path><path d="M3 3H2" data-astro-cid-3gw4p3li></path> </svg> <p data-astro-cid-3gw4p3li>Nothing here yet — try another category.</p> </div> </section>  <div class="load-more-wrap" id="load-more-wrap" style="display:none;" data-astro-cid-3gw4p3li> <button class="load-more-btn" id="load-more-btn" data-astro-cid-3gw4p3li>\nLoad more pieces\n<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li><path d="M5 12h14" data-astro-cid-3gw4p3li></path><path d="M12 5l7 7-7 7" data-astro-cid-3gw4p3li></path> </svg> </button> </div>  <div class="reco-section" id="reco-section" data-astro-cid-3gw4p3li> <div class="reco-divider" data-astro-cid-3gw4p3li> <div class="reco-divider-inner" data-astro-cid-3gw4p3li> <div data-astro-cid-3gw4p3li> <p class="reco-eyebrow" data-astro-cid-3gw4p3li>Curated for you</p> <h2 class="reco-title" data-astro-cid-3gw4p3li>\nExplore our <em data-astro-cid-3gw4p3li>recommendations</em> </h2> </div> <a href="#" class="reco-arrow-link" data-astro-cid-3gw4p3li>\nSee all\n<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li><path d="M7 17L17 7" data-astro-cid-3gw4p3li></path><path d="M7 7h10v10" data-astro-cid-3gw4p3li></path> </svg> </a> </div> <div class="reco-grid" data-astro-cid-3gw4p3li> ', ' </div> </div> </div>  <div class="shop-footer-strip" data-astro-cid-3gw4p3li> <span data-astro-cid-3gw4p3li>© ', ' Sunflora Studio — Handmade with care.</span> <span data-astro-cid-3gw4p3li>Hooked in India · <a href="/" data-astro-cid-3gw4p3li>Back to home</a></span> </div> <script>\n        // ── Category filter ──────────────────────────────────────────\n        const catBtns = document.querySelectorAll(".cat-btn");\n        const grid = document.getElementById("product-grid");\n        const cards = Array.from(grid.querySelectorAll(".prod-card"));\n        const countEl = document.getElementById("result-count");\n        const emptyEl = document.getElementById("empty-state");\n        const sortSel = document.getElementById("sort-select");\n\n        let activeCategory = "All";\n\n        // Parse query parameter to pre-filter\n        const urlParams = new URLSearchParams(window.location.search);\n        const categoryParam = urlParams.get("category");\n        if (categoryParam) {\n            const decodedCat = decodeURIComponent(categoryParam);\n            const matchedBtn = Array.from(catBtns).find(\n                (btn) =>\n                    btn.dataset.cat.toLowerCase() === decodedCat.toLowerCase(),\n            );\n            if (matchedBtn) {\n                catBtns.forEach((b) => {\n                    b.classList.remove("active");\n                    b.setAttribute("aria-selected", "false");\n                });\n                matchedBtn.classList.add("active");\n                matchedBtn.setAttribute("aria-selected", "true");\n                activeCategory = matchedBtn.dataset.cat;\n\n                // Scroll the category button into view on mobile\n                matchedBtn.scrollIntoView({\n                    behavior: "auto",\n                    block: "nearest",\n                    inline: "center",\n                });\n            }\n        }\n\n        function filterAndSort() {\n            const sort = sortSel.value;\n\n            // Determine filtered set\n            let filtered = cards.filter((c) => {\n                if (activeCategory === "All") return true;\n                return c.dataset.category === activeCategory;\n            });\n\n            // Sort\n            filtered = [...filtered].sort((a, b) => {\n                if (sort === "price-asc")\n                    return Number(a.dataset.price) - Number(b.dataset.price);\n                if (sort === "price-desc")\n                    return Number(b.dataset.price) - Number(a.dataset.price);\n                if (sort === "rating")\n                    return Number(b.dataset.rating) - Number(a.dataset.rating);\n                if (sort === "new")\n                    return Number(b.dataset.new) - Number(a.dataset.new);\n                return 0; // default = DOM order\n            });\n\n            // Hide all first\n            cards.forEach((c) => {\n                c.style.display = "none";\n                c.style.animationName = "none";\n            });\n\n            // Re-show filtered and trigger animation\n            filtered.forEach((c, i) => {\n                c.style.display = "";\n                // Restart animation with staggered delay\n                requestAnimationFrame(() => {\n                    c.style.animationName = "";\n                    c.style.animationDelay = i * 0.06 + "s";\n                    c.style.animationDuration = "0.45s";\n                    c.style.opacity = "0";\n                    c.style.animationName = "cardIn";\n                });\n            });\n\n            // Update count\n            countEl.textContent = filtered.length;\n\n            // Empty state\n            emptyEl.classList.toggle("show", filtered.length === 0);\n        }\n\n        catBtns.forEach((btn) => {\n            btn.addEventListener("click", () => {\n                catBtns.forEach((b) => {\n                    b.classList.remove("active");\n                    b.setAttribute("aria-selected", "false");\n                });\n                btn.classList.add("active");\n                btn.setAttribute("aria-selected", "true");\n                activeCategory = btn.dataset.cat;\n\n                // Scroll active btn into view on mobile\n                btn.scrollIntoView({\n                    behavior: "smooth",\n                    block: "nearest",\n                    inline: "center",\n                });\n\n                filterAndSort();\n            });\n        });\n\n        sortSel.addEventListener("change", filterAndSort);\n\n        // Run initial filter on page load\n        filterAndSort();\n\n        // ── Wishlist persistence (session) ───────────────────────────\n        document.querySelectorAll(".card-wishlist").forEach((btn) => {\n            btn.addEventListener("click", (e) => {\n                e.preventDefault();\n                e.stopPropagation();\n                btn.classList.toggle("active");\n                const svgPath = btn.querySelector("path");\n                if (svgPath) {\n                    const isActive = btn.classList.contains("active");\n                    svgPath.setAttribute(\n                        "fill",\n                        isActive ? "currentColor" : "none",\n                    );\n                }\n            });\n        });\n\n        // ── Recommendation section reveal on scroll ──────────────────\n        const recoSection = document.getElementById("reco-section");\n        if (recoSection) {\n            const recoCards = recoSection.querySelectorAll(".prod-card");\n            recoCards.forEach((c) => {\n                c.style.opacity = "0";\n                c.style.animationName = "none";\n            });\n\n            const recoObserver = new IntersectionObserver(\n                (entries) => {\n                    entries.forEach((entry) => {\n                        if (entry.isIntersecting) {\n                            recoCards.forEach((c, i) => {\n                                c.style.animationDelay = i * 0.1 + "s";\n                                c.style.animationDuration = "0.55s";\n                                c.style.animationName = "cardIn";\n                            });\n                            recoObserver.disconnect();\n                        }\n                    });\n                },\n                { threshold: 0.1 },\n            );\n            recoObserver.observe(recoSection);\n        }\n    </script> '])), renderComponent($$result2, "Nav", $$Nav, { "data-astro-cid-3gw4p3li": true }), maybeRenderHead(), allProducts.length, categories.map((cat, i) => renderTemplate`<button${addAttribute(`cat-btn${i === 0 ? " active" : ""}`, "class")}${addAttribute(cat, "data-cat")} role="tab"${addAttribute(i === 0 ? "true" : "false", "aria-selected")} data-astro-cid-3gw4p3li> ${cat} </button>`), allProducts.length, allProducts.map((p) => {
    const disc = Math.round((1 - p.price / p.mrp) * 100);
    const tagClass = p.tag === "New" ? "tag-new" : p.tag === "Fan Fav" || p.tag === "Top Rated" ? "tag-gold" : "";
    return renderTemplate`<a${addAttribute(`/productdetail?id=${p.id}`, "href")}${addAttribute(`prod-card${!p.inStock ? " out-of-stock" : ""}`, "class")}${addAttribute(p.category, "data-category")}${addAttribute(p.price, "data-price")}${addAttribute(p.rating, "data-rating")}${addAttribute(p.isNew ? "1" : "0", "data-new")}${addAttribute(`${p.name} — ₹${p.price}`, "aria-label")} data-astro-cid-3gw4p3li> <div class="card-img-wrap" data-astro-cid-3gw4p3li> ${renderComponent($$result2, "Image", $$Image, { "src": p.img, "alt": p.name, "class": "card-img", "loading": "lazy", "data-astro-cid-3gw4p3li": true })} ${p.tag && renderTemplate`<span${addAttribute(`card-tag ${tagClass}`, "class")} data-astro-cid-3gw4p3li> ${p.tag} </span>`} ${!p.inStock && renderTemplate`<div class="out-of-stock-badge" data-astro-cid-3gw4p3li> <span data-astro-cid-3gw4p3li>Sold Out</span> </div>`} <button class="card-wishlist"${addAttribute(`Wishlist ${p.name}`, "aria-label")} onclick="event.preventDefault(); this.classList.toggle('active');" data-astro-cid-3gw4p3li> <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li> <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" data-astro-cid-3gw4p3li></path> </svg> </button> ${p.inStock && renderTemplate`<div class="card-cta" data-astro-cid-3gw4p3li> <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li> <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" data-astro-cid-3gw4p3li></path> <line x1="3" y1="6" x2="21" y2="6" data-astro-cid-3gw4p3li></line> <path d="M16 10a4 4 0 0 1-8 0" data-astro-cid-3gw4p3li></path> </svg>
Buy Now
</div>`} </div> <div class="card-body" data-astro-cid-3gw4p3li> <span class="card-cat" data-astro-cid-3gw4p3li>${p.category}</span> <h2 class="card-name" data-astro-cid-3gw4p3li>${p.name}</h2> <div class="card-rating" data-astro-cid-3gw4p3li> <span class="card-stars" data-astro-cid-3gw4p3li> ${"★".repeat(Math.floor(p.rating))} ${"☆".repeat(5 - Math.floor(p.rating))} </span> <span class="card-rating-num" data-astro-cid-3gw4p3li> ${p.rating} </span> <span class="card-rating-count" data-astro-cid-3gw4p3li>
(${p.reviews})
</span> </div> <div class="card-price-row" data-astro-cid-3gw4p3li> <span class="card-price" data-astro-cid-3gw4p3li>₹${p.price}</span> <span class="card-mrp" data-astro-cid-3gw4p3li>₹${p.mrp}</span> <span class="card-disc" data-astro-cid-3gw4p3li>${disc}% off</span> </div> </div> </a>`;
  }), recommendations.map((p) => {
    const disc = Math.round((1 - p.price / p.mrp) * 100);
    const tagClass = p.tag === "New" ? "tag-new" : p.tag === "Top Rated" || p.tag === "Fan Fav" ? "tag-gold" : "";
    return renderTemplate`<a${addAttribute(`/productdetail?id=${p.id}`, "href")} class="prod-card"${addAttribute(`${p.name} — ₹${p.price}`, "aria-label")} data-astro-cid-3gw4p3li> <div class="card-img-wrap" data-astro-cid-3gw4p3li> ${renderComponent($$result2, "Image", $$Image, { "src": p.img, "alt": p.name, "class": "card-img", "loading": "lazy", "data-astro-cid-3gw4p3li": true })} ${p.tag && renderTemplate`<span${addAttribute(`card-tag ${tagClass}`, "class")} data-astro-cid-3gw4p3li> ${p.tag} </span>`} <button class="card-wishlist"${addAttribute(`Wishlist ${p.name}`, "aria-label")} onclick="event.preventDefault(); this.classList.toggle('active');" data-astro-cid-3gw4p3li> <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li> <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" data-astro-cid-3gw4p3li></path> </svg> </button> <div class="card-cta" data-astro-cid-3gw4p3li> <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3gw4p3li> <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" data-astro-cid-3gw4p3li></path> <line x1="3" y1="6" x2="21" y2="6" data-astro-cid-3gw4p3li></line> <path d="M16 10a4 4 0 0 1-8 0" data-astro-cid-3gw4p3li></path> </svg>
Buy Now
</div> </div> <div class="card-body" data-astro-cid-3gw4p3li> <span class="card-cat" data-astro-cid-3gw4p3li>${p.category}</span> <h2 class="card-name" data-astro-cid-3gw4p3li>${p.name}</h2> <div class="card-rating" data-astro-cid-3gw4p3li> <span class="card-stars" data-astro-cid-3gw4p3li> ${"★".repeat(Math.floor(p.rating))} ${"☆".repeat(
      5 - Math.floor(p.rating)
    )} </span> <span class="card-rating-num" data-astro-cid-3gw4p3li> ${p.rating} </span> <span class="card-rating-count" data-astro-cid-3gw4p3li>
(${p.reviews})
</span> </div> <div class="card-price-row" data-astro-cid-3gw4p3li> <span class="card-price" data-astro-cid-3gw4p3li>
₹${p.price} </span> <span class="card-mrp" data-astro-cid-3gw4p3li>₹${p.mrp}</span> <span class="card-disc" data-astro-cid-3gw4p3li> ${disc}% off
</span> </div> </div> </a>`;
  }), (/* @__PURE__ */ new Date()).getFullYear()) })}`;
}, "/home/someone_practicing/sunflora/src/pages/productlist.astro", void 0);
const $$file = "/home/someone_practicing/sunflora/src/pages/productlist.astro";
const $$url = "/productlist";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Productlist,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
