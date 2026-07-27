/**
 * A placeholder product (Product.requiresLineSpecs) carries no fixed spec
 * combination — each order line names its own mold. Keys match Product.specs
 * so a promoted mold can copy them straight across later.
 */
export const REQUIRED_SPEC_KEYS = [
  'machine',
  'capacity',
  'grams',
  'pattern',
] as const;

export type SpecKey = (typeof REQUIRED_SPEC_KEYS)[number];

export type MoldSpecs = Partial<Record<SpecKey, string>>;

function readSpecs(specs: unknown): MoldSpecs {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return {};
  return specs as MoldSpecs;
}

export function missingSpecKeys(specs: unknown): string[] {
  const s = readSpecs(specs);
  return REQUIRED_SPEC_KEYS.filter((key) => !s[key] || !String(s[key]).trim());
}

export function findIncompleteSpecLines(
  lines: { index: number; requiresLineSpecs: boolean; specs: unknown }[],
): { index: number; missing: string[] }[] {
  return lines
    .filter((line) => line.requiresLineSpecs)
    .map((line) => ({ index: line.index, missing: missingSpecKeys(line.specs) }))
    .filter((line) => line.missing.length > 0);
}

export function formatSpecs(specs: unknown): string {
  const s = readSpecs(specs);
  return REQUIRED_SPEC_KEYS.map((key) => s[key])
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(' · ');
}
