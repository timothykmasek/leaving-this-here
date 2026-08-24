import type { ProductInfo, RawMetadata } from '@/lib/metadata'

// The price a product card shows, stored under bookmarks.raw_metadata.product.
//
// Same shape as raw_metadata.place: a small derived fact written beside the raw
// capture, so the grid can select it as a narrow JSON path instead of hauling
// the whole blob. That matters — the price lives in the schema.org JSON-LD,
// which averages 1.3KB per row and peaks near 19KB. Selecting jsonLd to serve a
// price would add ~190KB to a 145-card page in order to decorate the 2% of
// cards that are products. This is a few dozen bytes.
//
// pickProduct() does the actual parsing at save time. This is only the
// narrowing: what's worth keeping, and what counts as a price at all.

// Above this, the number is a sentinel rather than a price. Shopify stores that
// want "email for price" sometimes publish a filler value — sunabonometti.com
// ships `price: 160007857, priceCurrency: SGD` on a sculpture whose own
// description reads "email for price". Nothing this catalogue sells is a
// million anything, and showing no chip is the safe failure.
const MAX_PLAUSIBLE_PRICE = 1_000_000

export type ProductFact = {
  priceFormatted: string
  price: number
  currency: string | null
}

/**
 * The storable price fact, or null when there isn't a real one.
 *
 * A published price of ZERO is not a price. Several SaaS pages declare
 * `offers.price: 0` for a free tier, and "$0" in the slot where a shopper
 * expects a number reads as broken rather than as free.
 */
export function productFact(product: ProductInfo | null | undefined): ProductFact | null {
  if (!product) return null
  const { price, priceFormatted, currency } = product
  if (price === null || price === 0 || !priceFormatted) return null
  if (price < 0 || price > MAX_PLAUSIBLE_PRICE) return null
  return { priceFormatted, price, currency }
}

/**
 * raw_metadata for storage, with the derived price folded in when there is one.
 * Returns the raw object untouched otherwise, so a non-product save is byte-for
 * byte what it always was.
 */
export function withProductFact(
  raw: RawMetadata | null,
  product: ProductInfo | null | undefined
): (RawMetadata & { product?: ProductFact }) | null {
  if (!raw) return raw
  const fact = productFact(product)
  return fact ? { ...raw, product: fact } : raw
}
