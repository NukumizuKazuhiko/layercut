/**
 * Attribute-safe hex colour: exactly #rrggbb, case-insensitive.
 *
 * Colours cross several trust boundaries (browser color inputs, project
 * files, generated SVG markup), so every site validates with this predicate.
 */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
