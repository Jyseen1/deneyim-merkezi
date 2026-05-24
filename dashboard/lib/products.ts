// Rezervasyon "product" alani — DB'de slug saklanir, UI'da label gosterilir.
// Backend backend/src/types/product.ts ile birebir senkron olmali (ayni slug
// + ayni Turkce label); yeni urun eklerken iki yere de ekle.

export const PRODUCT_SLUGS = ["gigax", "sangfor", "gigabyte", "diger"] as const;

export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const PRODUCT_LABEL: Record<ProductSlug, string> = {
  gigax: "Giga X",
  sangfor: "Sangfor",
  gigabyte: "Gigabyte",
  diger: "Diğer",
};

// Liste sayfasi filtresi/dropdown'lar icin hazir array.
export const PRODUCT_OPTIONS: { slug: ProductSlug; label: string }[] =
  PRODUCT_SLUGS.map((s) => ({ slug: s, label: PRODUCT_LABEL[s] }));

// DB'den okunan string'i (legacy/eski rows null olabilir) label'a cevir.
export function productLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return (PRODUCT_LABEL as Record<string, string>)[slug] ?? "—";
}
