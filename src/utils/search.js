/** Escapes user input so it can be safely used inside a RegExp. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits a free-text search string into at most `max` short terms.
 * "  Graphic   designer " -> ["graphic", "designer"]. A leading "@" is dropped
 * so "@larrydev" finds the username "larrydev".
 */
export function tokenizeQuery(q, max = 5) {
  if (typeof q !== 'string') return [];
  return q
    .toLowerCase()
    .replace(/^@/, '')
    .split(/\s+/)
    .map((t) => t.replace(/^@/, '').trim())
    .filter(Boolean)
    .map((t) => t.slice(0, 40))
    .slice(0, max);
}

export function isObjectIdString(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}
