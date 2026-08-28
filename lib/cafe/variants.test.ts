/**
 * Unit tests for lib/cafe/variants.ts (I-044, FR-720/FR-721).
 */
import { describe, it, expect } from "vitest";
import { parseVariantConfig, validateVariantSelections } from "@/lib/cafe/variants";
import type { VariantConfig } from "@/lib/cafe/types";

const VALID_CONFIG: VariantConfig = {
  variants: [
    {
      name: "Temperature",
      required: true,
      options: [
        { name: "Hot", priceAdjustment: 0 },
        { name: "Cold", priceAdjustment: 3000 },
      ],
    },
    {
      name: "Sugar",
      required: true,
      options: [
        { name: "Normal Sugar", priceAdjustment: 0 },
        { name: "Less Sugar", priceAdjustment: 0 },
        { name: "No Sugar", priceAdjustment: 0 },
      ],
    },
  ],
};

describe("parseVariantConfig", () => {
  it("AC-700: parses a valid config — required groups, option names, integer adjustments are available", () => {
    const parsed = parseVariantConfig(VALID_CONFIG);
    expect(parsed.variants).toHaveLength(2);
    expect(parsed.variants[0].name).toBe("Temperature");
    expect(parsed.variants[0].required).toBe(true);
    expect(parsed.variants[0].options.map((o) => o.name)).toEqual(["Hot", "Cold"]);
    expect(parsed.variants[0].options[1].priceAdjustment).toBe(3000);
  });

  it("AC-700: rejects a malformed config (not an object)", () => {
    expect(() => parseVariantConfig("not-json")).toThrow(/INVALID_VARIANT_CONFIG/);
  });

  it("AC-700: rejects an empty variants array", () => {
    expect(() => parseVariantConfig({ variants: [] })).toThrow(/INVALID_VARIANT_CONFIG/);
  });

  it("AC-700: rejects duplicate group names", () => {
    expect(() =>
      parseVariantConfig({
        variants: [
          { name: "Sugar", required: true, options: [{ name: "A", priceAdjustment: 0 }] },
          { name: "Sugar", required: true, options: [{ name: "B", priceAdjustment: 0 }] },
        ],
      }),
    ).toThrow(/INVALID_VARIANT_CONFIG/);
  });

  it("AC-700: rejects duplicate option names within a group", () => {
    expect(() =>
      parseVariantConfig({
        variants: [
          {
            name: "Sugar",
            required: true,
            options: [
              { name: "A", priceAdjustment: 0 },
              { name: "A", priceAdjustment: 0 },
            ],
          },
        ],
      }),
    ).toThrow(/INVALID_VARIANT_CONFIG/);
  });

  it("AC-700: rejects a negative or non-integer priceAdjustment", () => {
    for (const bad of [-1, 1.5, "3000"]) {
      expect(() =>
        parseVariantConfig({
          variants: [
            { name: "Sugar", required: true, options: [{ name: "A", priceAdjustment: bad }] },
          ],
        }),
      ).toThrow(/INVALID_VARIANT_CONFIG/);
    }
  });
});

describe("validateVariantSelections", () => {
  it("AC-705: rejects a line missing a required group", () => {
    expect(() =>
      validateVariantSelections(
        { hasVariants: true, variantConfig: VALID_CONFIG },
        [{ variantName: "Temperature", optionName: "Hot" }], // Sugar omitted
      ),
    ).toThrow(/MISSING_REQUIRED_VARIANT/);
  });

  it("AC-705: rejects an unknown option", () => {
    expect(() =>
      validateVariantSelections(
        { hasVariants: true, variantConfig: VALID_CONFIG },
        [
          { variantName: "Temperature", optionName: "Lukewarm" },
          { variantName: "Sugar", optionName: "Normal Sugar" },
        ],
      ),
    ).toThrow(/INVALID_VARIANTS/);
  });

  it("AC-705: rejects an unknown group", () => {
    expect(() =>
      validateVariantSelections(
        { hasVariants: true, variantConfig: VALID_CONFIG },
        [
          { variantName: "Temperature", optionName: "Hot" },
          { variantName: "Sugar", optionName: "Normal Sugar" },
          { variantName: "Size", optionName: "Large" },
        ],
      ),
    ).toThrow(/INVALID_VARIANTS/);
  });

  it("AC-709: hasVariants=false item with no options prices as base (empty snapshot)", () => {
    const snapshots = validateVariantSelections(
      { hasVariants: false, variantConfig: null },
      undefined,
    );
    expect(snapshots).toEqual([]);
  });

  it("AC-709: hasVariants=false item rejects supplied options", () => {
    expect(() =>
      validateVariantSelections(
        { hasVariants: false, variantConfig: null },
        [{ variantName: "Temperature", optionName: "Hot" }],
      ),
    ).toThrow(/INVALID_VARIANTS/);
  });

  it("[SEC] hasVariants=false item rejects a non-array `selections` value (not silently treated as empty)", () => {
    // A non-array truthy value (object/string/number) has an undefined/falsy
    // `.length`, so a `.length > 0` check alone lets it slip through as if
    // it were an empty selection — it must be rejected as malformed input.
    for (const bad of [{}, "not-an-array", 42, true] as unknown[]) {
      expect(() =>
        validateVariantSelections(
          { hasVariants: false, variantConfig: null },
          bad as never,
        ),
      ).toThrow(/INVALID_VARIANTS/);
    }
  });

  it("resolves valid selections into ordered snapshots with adjustments from the live config, not the input", () => {
    const snapshots = validateVariantSelections(
      { hasVariants: true, variantConfig: VALID_CONFIG },
      [
        // deliberately out of config order + a forged adjustment-shaped extra field
        { variantName: "Sugar", optionName: "No Sugar" },
        { variantName: "Temperature", optionName: "Cold" },
      ],
    );
    expect(snapshots).toEqual([
      { variantName: "Temperature", optionName: "Cold", priceAdjustmentRupiah: 3000 },
      { variantName: "Sugar", optionName: "No Sugar", priceAdjustmentRupiah: 0 },
    ]);
  });

  it("rejects a duplicate selection for the same group", () => {
    expect(() =>
      validateVariantSelections(
        { hasVariants: true, variantConfig: VALID_CONFIG },
        [
          { variantName: "Temperature", optionName: "Hot" },
          { variantName: "Temperature", optionName: "Cold" },
          { variantName: "Sugar", optionName: "Normal Sugar" },
        ],
      ),
    ).toThrow(/INVALID_VARIANTS/);
  });
});
