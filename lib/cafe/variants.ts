/**
 * Pure variant-config parsing + selection validation (I-044, FR-720/FR-721).
 * No DB access. Never trusts client price/adjustment values — the resolved
 * `priceAdjustmentRupiah` always comes from the live config, never the
 * selection input.
 */
import type {
  VariantConfig,
  VariantGroup,
  VariantOption,
  VariantOptionSnapshot,
  VariantSelectionInput,
} from "@/lib/cafe/types";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidOption(v: unknown): v is VariantOption {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isNonEmptyString(o.name) &&
    typeof o.priceAdjustment === "number" &&
    Number.isInteger(o.priceAdjustment) &&
    o.priceAdjustment >= 0
  );
}

function isValidGroup(v: unknown): v is VariantGroup {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  if (!isNonEmptyString(g.name)) return false;
  if (typeof g.required !== "boolean") return false;
  if (!Array.isArray(g.options) || g.options.length === 0) return false;
  if (!g.options.every(isValidOption)) return false;
  const optionNames = (g.options as VariantOption[]).map((o) => o.name);
  return new Set(optionNames).size === optionNames.length;
}

/**
 * Parses/validates the raw `variant_config` JSONB value into a `VariantConfig`.
 * Throws `INVALID_VARIANT_CONFIG` for any structural violation: not a plain
 * object, empty/missing `variants`, duplicate group names, duplicate option
 * names within a group, or a non-integer/negative `priceAdjustment`.
 */
export function parseVariantConfig(raw: unknown): VariantConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("INVALID_VARIANT_CONFIG");
  }
  const { variants } = raw as Record<string, unknown>;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("INVALID_VARIANT_CONFIG");
  }
  if (!variants.every(isValidGroup)) {
    throw new Error("INVALID_VARIANT_CONFIG");
  }
  const groupNames = (variants as VariantGroup[]).map((g) => g.name);
  if (new Set(groupNames).size !== groupNames.length) {
    throw new Error("INVALID_VARIANT_CONFIG");
  }
  return { variants: variants as VariantGroup[] };
}

/**
 * Validates a set of client-submitted selections against a menu item's live
 * `hasVariants`/`variantConfig`, and returns the resolved, ordered snapshots.
 *
 * - `hasVariants=false`: any non-empty `selections` is rejected
 *   (`INVALID_VARIANTS`); returns `[]` otherwise.
 * - `hasVariants=true`: `variantConfig` must parse; every `required` group
 *   must have exactly one selection (`MISSING_REQUIRED_VARIANT` if absent);
 *   every selected group/option must exist in the live config
 *   (`INVALID_VARIANTS` for unknown group/option or a duplicate group
 *   selection); the returned `priceAdjustmentRupiah` always comes from the
 *   live config option, never the selection input.
 *
 * Returned snapshots are ordered by the config's group order, not the
 * selection input order.
 */
export function validateVariantSelections(
  item: { hasVariants: boolean; variantConfig: unknown },
  selections: VariantSelectionInput[] | null | undefined,
): VariantOptionSnapshot[] {
  const provided = selections ?? [];

  // A non-array truthy value (object/string/number) has an undefined/falsy
  // `.length`, so a `.length > 0` check alone would let it slip through the
  // hasVariants=false branch below as if it were an empty selection — reject
  // it as malformed input up front, for BOTH branches [SEC].
  if (!Array.isArray(provided)) throw new Error("INVALID_VARIANTS");

  if (!item.hasVariants) {
    if (provided.length > 0) throw new Error("INVALID_VARIANTS");
    return [];
  }

  const config = parseVariantConfig(item.variantConfig);

  if (
    !provided.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        isNonEmptyString((s as VariantSelectionInput).variantName) &&
        isNonEmptyString((s as VariantSelectionInput).optionName),
    )
  ) {
    throw new Error("INVALID_VARIANTS");
  }

  const selectedGroupNames = provided.map((s) => s.variantName);
  if (new Set(selectedGroupNames).size !== selectedGroupNames.length) {
    throw new Error("INVALID_VARIANTS");
  }

  const knownGroupNames = new Set(config.variants.map((g) => g.name));
  if (selectedGroupNames.some((n) => !knownGroupNames.has(n))) {
    throw new Error("INVALID_VARIANTS");
  }

  const selectionByGroup = new Map(provided.map((s) => [s.variantName, s.optionName]));

  const snapshots: VariantOptionSnapshot[] = [];
  for (const group of config.variants) {
    const selectedOptionName = selectionByGroup.get(group.name);
    if (selectedOptionName === undefined) {
      if (group.required) throw new Error("MISSING_REQUIRED_VARIANT");
      continue;
    }
    const option = group.options.find((o) => o.name === selectedOptionName);
    if (!option) throw new Error("INVALID_VARIANTS");
    snapshots.push({
      variantName: group.name,
      optionName: option.name,
      priceAdjustmentRupiah: option.priceAdjustment,
    });
  }

  return snapshots;
}
