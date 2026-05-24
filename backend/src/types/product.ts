// Rezervasyon "product" alani — DB'de slug saklanir, UI/email'de label gosterilir.
// Slug'lar ASCII (DB stabil); label'lar Turkce karakter icerebilir (sadece goruntu).
// Yeni urun eklemek: PRODUCT_SLUGS array'ine ekle + PRODUCT_LABEL_TR'ye Turkce label.
// Migration GEREKMEZ (kolon String?, enum degil).

export const PRODUCT_SLUGS = ["gigax", "sangfor", "gigabyte", "diger"] as const;

export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

export const PRODUCT_LABEL_TR: Record<ProductSlug, string> = {
  gigax: "Giga X",
  sangfor: "Sangfor",
  gigabyte: "Gigabyte",
  diger: "Diğer",
};

// Helper — DB'den okunan string'i (legacy/eski rows null olabilir) label'a cevir.
// Bilinmeyen slug "—" doner; tip kaybi olmasin diye explicit narrowing.
export function productLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return (PRODUCT_LABEL_TR as Record<string, string>)[slug] ?? "—";
}
