# GEO / AI Search Analysis — Sunflora

Target: https://sunfloracrochet.in
Date: 2026-09-19

> Per Google's AI optimization guide, optimizing for generative AI search is still
> SEO. Nothing below is a separate discipline — it's SEO fundamentals applied to
> AI-search surfaces.

## 1. GEO Readiness Score

**Live site today: 48/100**
**Branch `sep` once deployed: 61/100**

The gap is the point: the live deployment is behind the branch and serves zero
structured data.

| Category | Weight | Live | Branch | Note |
|---|---|---|---|---|
| Technical accessibility | 20% | 70 | 85 | SSR strong; robots.txt added on branch |
| Structural readability | 20% | 55 | 78 | FAQ questions now real H3 headings |
| Citability | 25% | 55 | 62 | 30 FAQ answers, 5 definitional |
| Authority & brand | 20% | 25 | 30 | No dates, no author entity, 1 `sameAs` |
| Multi-modal | 15% | 45 | 45 | Images yes, no video |

## 2. Platform Breakdown

| Platform | Outlook | Why |
|---|---|---|
| Google AI Overviews | Low | Cites pages that already rank; site ranks for little yet |
| Google AI Mode | Low | Broader pool, but weights freshness + entity authority — both absent |
| ChatGPT | Very low | Cites Wikipedia (47.9%) and Reddit (11.3%); no presence on either |
| Perplexity | Very low | Cites Reddit (46.7%); no presence |
| Bing Copilot | Low | No IndexNow, no Bing Webmaster setup |

Only ~11% of domains are cited by both ChatGPT and Google AI Overviews for the same
query, so these need to be treated as separate surfaces.

## 3. AI Crawler Access

The live site returns **404 for `/robots.txt`**, which means nothing is blocked —
every crawler below has access. That's the desired end state, reached by accident
rather than intent. The `robots.txt` added on branch `sep` preserves it.

| Crawler | Governs | Status |
|---|---|---|
| `Googlebot` | Google Search + AI Overviews/AI Mode eligibility | Allowed |
| `OAI-SearchBot` | ChatGPT Search citability | Allowed |
| `Claude-SearchBot` | Claude search citability | Allowed |
| `PerplexityBot` | Perplexity | Allowed |
| `GPTBot` | OpenAI model training only | Allowed |
| `ClaudeBot` | Anthropic model training only | Allowed |
| `Google-Extended` | Gemini/Vertex training + grounding only | Allowed |
| `CCBot` | Common Crawl training data | Allowed |

Training access and search citability are separate concerns — `GPTBot` being allowed
says nothing about ChatGPT Search citability, which is governed by `OAI-SearchBot`.
Likewise `Google-Extended` governs Gemini training only and has no bearing on
AI Overviews, which are served from the `Googlebot` index.

The new `robots.txt` disallows only `/account/`, `/cart/`, `/checkout/`,
`/order-confirmation/`, `/login/`, `/signup/` and the not-found page, and points at
`https://sunfloracrochet.in/sitemap-index.xml` — which was being generated but had
nothing referencing it.

## 4. llms.txt Status

**Absent.** Deliberately not recommended as a priority: Google's AI optimization
guide states `llms.txt` is not needed for Google Search and neither helps nor hurts
visibility. Independent evidence (SE Ranking's 300k-domain study, OtterlyAI's
server-log audit) found no citation lever for major AI search systems either.
Add it only if you want to serve non-Google crawlers; it earns no score here.

## 5. Brand Mention Analysis

Brand mentions correlate roughly **3x more strongly with AI visibility than
backlinks** (Ahrefs, 75,000 brands). Current state:

| Platform | Presence | Correlation strength |
|---|---|---|
| YouTube | None | ~0.737 — strongest single signal |
| Reddit | None | High |
| Wikipedia | None | High (47.9% of ChatGPT citations) |
| LinkedIn | None | Moderate |
| Instagram | Yes (`sunfloraa.a`) | Not a major citation source |

This is the weakest area and the one with the most headroom. A YouTube channel
showing the making process would address both the strongest mention correlate and
the multi-modal gap in one move.

## 6. Passage-Level Citability

Optimal citable passages run 134–167 words, and ~44% of AI citations come from the
first 30% of a page.

**Strongest asset: the 30 FAQ answers.** They are specific, self-contained and
factual — "7–10 working days", "free shipping anywhere in India, no minimum cart
value", order format `ORD-A1B2C3D4`, sizes "3 inch (7–8 cm), 5 inch (12–13 cm)".
These extract cleanly without surrounding context, which is exactly what gets cited.

Five follow definitional `X is...` patterns:
- What is amigurumi? — "Amigurumi is the Japanese art of crocheting small stuffed creatures…"
- What are your pieces made from?
- Why do handmade crochet pieces cost more than factory toys?
- Is crochet eco-friendly?
- How does a custom crochet order work?

**Gaps:** no original research or unique data points, no comparison tables, and
product descriptions are specific but marketing-toned rather than factual.

## 7. Server-Side Rendering Check

**Pass.** AI crawlers do not execute JavaScript, and this is where most JS
e-commerce sites fail. Sunflora does not.

Astro resolves product data from Supabase at build time (`getStaticPaths` plus
top-level `await` in the frontmatter), so the raw HTML already contains the real
content before any script runs. Verified on `/productdetail/sunflower-pot/`:
`<h1>Sunflower Pot</h1>`, `₹ 899`, the full description and 28 image tags are all
present in the served HTML.

The client-side `hydratePDP()` script re-writes this content after load, but it
re-writes it with the same values, so a non-JS crawler sees correct data.

## 8. Top 5 Highest-Impact Changes

1. **Deploy branch `sep`.** Organization + WebSite + Product + Offer + BreadcrumbList
   schema, `robots.txt`, and the FAQ heading structure are all built and verified,
   and none of it is doing anything while undeployed. Largest single gain available.
2. **Build entity presence off-site** — YouTube first (strongest correlate and closes
   the multi-modal gap), then Reddit, then LinkedIn for Aru Jaiswal.
3. **Add dates and author identity.** No page carries a publication or updated date;
   content under 3 months old is ~3x more likely to be cited, and pages stale 6+
   months lose citation eligibility. Add `Person` schema for Aru Jaiswal with a real
   bio and credentials.
4. **Wire `availability` to real stock data.** The Product schema currently always
   emits `InStock`; `in_stock` exists on the `products_with_image` view but not on
   the base `products` table, so it never reaches the schema.
5. **Publish something genuinely citable** — a yarn care guide or a size guide with
   real measurements. There is currently no original data anywhere on the site.

## 9. Schema Recommendations

Present on branch `sep`:
- `Organization` + `WebSite` (homepage), sharing one `@id` with the FAQ page
- `Product` + `Offer` + `AggregateRating` (product pages, server-rendered)
- `BreadcrumbList` (product pages, FAQ)
- `FAQPage` (FAQ page)

Still missing:
- `Person` for Aru Jaiswal, linked from `Organization.founder`, with `sameAs`
- `ImageObject` for product images with captions
- Expanded `sameAs` once YouTube/Reddit/LinkedIn profiles exist

Note on `FAQPage`: Google retired FAQ rich results for all sites on 2026-05-07.
Keep the existing markup — it costs nothing and may serve non-Google systems — but
expect no Google SERP feature from it, and don't add `FAQPage` elsewhere for SERP
benefit.

## 10. Content Reformatting Suggestions

- **Homepage H1** is "Crochet that feels like home ♡" — emotive, with no entity or
  category anchor. A model reading it learns nothing about what is sold or where.
  Consider carrying the category and geography in supporting copy near the top.
- **Product pages carry only 3 headings** (product name, "Ratings & Reviews", "You
  might also love"). The description, materials and care information sit in
  accordions without headings, so there is no queryable structure around them.
- **FAQ questions are now H3 headings** (fixed on branch) — previously
  `<span class="faq-q">` inside accordion buttons, which matched no query pattern.
  Structure is now H1 → H2 topic groups → H3 questions.

---

## Corrections Made During This Analysis

Two claims made earlier in the session were wrong and are corrected above:

1. **"No price or image in the static HTML"** — false. That conclusion came from
   reading only the meta tags, not the body. Product content is fully server-rendered.
2. **"No definitional content / no `X is...` patterns"** — false. Five exist in
   `src/data/faqs.ts`, including "What is amigurumi?". The earlier JSON-LD extract
   was truncated at 3000 characters, which cut off the entire craft group.
