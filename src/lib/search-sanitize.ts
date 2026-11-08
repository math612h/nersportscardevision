/**
 * Neutralises a free-text search term before it is embedded in a PostgREST
 * `.or()` filter string. Characters that carry filter syntax (separators,
 * grouping, quoting, escapes, wildcards) are removed so a caller can only
 * search by name and never add extra conditions.
 */
export function sanitizeSearchTerm(input: string, maxLength = 80): string {
  return (input ?? "")
    .replace(/[,()"'\\%*:;{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
