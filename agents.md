# Sunflora (Sunflora) — Project Context

## Project Overview
Sunflora is a handmade crochet e-commerce store built with **Astro 6** + **Tailwind CSS 4** + **Supabase**.
The brand identity is being redesigned to match a warm, pastel, feminine "Sunflora" aesthetic.

## Tech Stack
- **Framework**: Astro 6.3.1 (SSG/SSR hybrid)
- **Styling**: Tailwind CSS 4.3 (via `@tailwindcss/vite` plugin)
- **Database**: Supabase (PostgreSQL)
- **Smooth Scroll**: Lenis
- **Deployment**: Cloudflare Workers (via Wrangler)
- **Domain**: sunfloracrochet.in

## Design System — "Sunflora" Theme
### Color Palette
- **Cream Background**: `#FFF8F0` (warm off-white)
- **Section Alt BG**: `#FDF2E9` (soft peach)
- **Primary Rose**: `#8B4557` (dark rose / maroon)
- **Accent Pink**: `#D4708F` (soft pink for CTAs)
- **Brown Text**: `#5C3D2E` (warm brown headings)
- **Body Text**: `#6B5B4E` (muted warm brown)
- **Card BG**: `#FFFFFF`
- **Border Soft**: `#E8D5C4` (warm taupe)
- **Gold Accent**: `#C8862C` (for highlights)

### Typography
- **Headings**: 'Playfair Display', serif (elegant, warm)
- **Body**: 'Inter', sans-serif (clean, readable)
- **Decorative**: Cursive for "You", "Love" accents

### Design Principles
1. Warm, cozy, handmade aesthetic
2. Soft curves and rounded corners
3. Decorative yarn/thread SVG illustrations as design elements
4. Heart and yarn emojis for warmth
5. Product-centric layout with generous whitespace
6. Pastel color palette (pink, cream, beige, brown)

## File Structure
- `src/pages/index.astro` — Main landing page (uses landing components)
- `src/components/landing/` — Landing page specific components
- `src/styles/global.css` — Global styles and design tokens
- `public/images/landing/` — Generated product images
- `src/layouts/Layout.astro` — Base HTML layout

## Key Sections (Landing Page)
1. **Navbar** — Logo, nav links, search/user/cart icons
2. **Hero** — "Every Stitch, Made with Love ♡" with bunny hero image
3. **Trust Badges** — 100% Handmade, Premium Quality, Made to Order, Sustainable
4. **Shop by Categories** — 4 category cards (Bouquets, Soft Toys, Home Decor, Wearables)
5. **Custom Orders** — Split layout with features and CTA
6. **Service Bar** — On-Time Delivery, Easy Returns, Customizations, Support
7. **Best Sellers** — Product grid with prices
8. **New Arrivals** — Product grid with prices
9. **Loved by Many** — Customer favorites gallery
10. **Founder Note** — Personal message section
11. **Story Banner** — "Where Every Stitch Tells a Story"
12. **Footer** — Full footer with links, social, contact

## Image Assets (in `public/images/landing/`)
- `hero-bunny.png` — Hero section crochet bunny
- `cat-bouquet.png` — Flower bouquets category
- `cat-soft-toys.png` — Soft toys category
- `cat-home-decor.png` — Home decor category
- `cat-wearables.png` — Wearables category
- `custom-hands.png` — Custom orders section
- `prod-teddy.png` — Teddy bear product
- `prod-yarn.png` — Yarn ball
- `prod-bag.png` — Crochet bag
- `prod-tulips.png` — Tulip bouquet
- `prod-pillow.png` — Crochet pillow
- `prod-hairclips.png` — Hair accessories
- `prod-bunny.png` — Small bunny
- `prod-basket.png` — Crochet basket

## Notes
- Site was previously a dark/gold artisanal theme — being redesigned to pastel "Sunflora" style
- Supabase integration for dynamic products remains — landing page is primarily static
- Lenis smooth scroll is integrated globally
