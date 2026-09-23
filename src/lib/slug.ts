export function productSlug(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* Categories use the identical rule. This alias exists so there is one
   derivation function, not three — src/lib/admin/views/categories.ts used to
   keep its own local copy, which is how the categories.slug column went
   stale (see categorySlug's own callers for the full story). */
export const categorySlug = productSlug;
