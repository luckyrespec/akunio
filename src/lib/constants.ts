/**
 * Global Constants & Configurations for Selectors and Search Components
 */

/** Default debounce time for search inputs across all searchable selectors */
export const DEFAULT_SEARCH_DEBOUNCE_MS = 500;

/** Default maximum number of items displayed in selector dropdowns */
export const DEFAULT_SEARCH_VIEW_LIMIT = 5;

export interface NormalizedAccount {
  id: string;
  code: string;
  name: string;
  label: string;
}

/**
 * Parses raw account items (which may have code/name or just a combined label like "1110 · Kas")
 * into a standardized structure.
 */
export function normalizeAccount(acc: {
  id: string;
  code?: string;
  name?: string;
  label?: string;
}): NormalizedAccount {
  let code = acc.code ?? "";
  let name = acc.name ?? "";
  const label = acc.label ?? (code && name ? `${code} · ${name}` : code || name || acc.id);

  if ((!code || !name) && acc.label) {
    const parts = acc.label.split(" · ");
    if (parts.length >= 2) {
      code = parts[0]?.trim() ?? "";
      name = parts.slice(1).join(" · ").trim();
    } else {
      const spaceIdx = acc.label.indexOf(" ");
      if (spaceIdx > 0 && /^\d+/.test(acc.label)) {
        code = acc.label.slice(0, spaceIdx).trim();
        name = acc.label.slice(spaceIdx + 1).trim();
      } else {
        name = acc.label;
      }
    }
  }

  return {
    id: acc.id,
    code,
    name,
    label,
  };
}

/**
 * Filters a list of accounts by search query matching:
 * 1. Account code / number (e.g. "1110", "11", "51")
 * 2. Account name (e.g. "Kas", "Sewa", "Bank")
 * 3. Combined label
 *
 * Slices the output to `limit` items (default: DEFAULT_SEARCH_VIEW_LIMIT = 5).
 */
export function filterAccountOptions<
  T extends { id: string; code?: string; name?: string; label?: string }
>(
  accounts: T[],
  query: string,
  limit: number = DEFAULT_SEARCH_VIEW_LIMIT
): {
  items: T[];
  totalMatches: number;
  hasMore: boolean;
} {
  const q = query.trim().toLowerCase();

  if (!q) {
    return {
      items: accounts.slice(0, limit),
      totalMatches: accounts.length,
      hasMore: accounts.length > limit,
    };
  }

  const matched = accounts.filter((item) => {
    const normalized = normalizeAccount(item);
    const codeMatch = normalized.code.toLowerCase().includes(q);
    const nameMatch = normalized.name.toLowerCase().includes(q);
    const labelMatch = normalized.label.toLowerCase().includes(q);
    return codeMatch || nameMatch || labelMatch;
  });

  return {
    items: matched.slice(0, limit),
    totalMatches: matched.length,
    hasMore: matched.length > limit,
  };
}
