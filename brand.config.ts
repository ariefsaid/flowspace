/**
 * White-label brand configuration.
 *
 * Every consumer-facing string that identifies the product should come from
 * here so a single deployment can be re-skinned per tenant via env vars.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "FlowSpace",
  tagline: "Coworking + cafe, run as one platform.",
  locale: "id-ID",
} as const;

export type Brand = typeof brand;
