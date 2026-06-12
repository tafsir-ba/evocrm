/** Shared color validation for dictionary items and tags (client + server safe). */

const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

export function normalizeHexColor(value: string): string {
  return value.trim();
}
