// Tiny helpers for syncing simple filter/pagination state to the URL via
// react-router-dom's useSearchParams — not a state-management abstraction,
// just comma-list (de)serialization and "empty value deletes the key".

/** Parse a comma-joined URL param into a string array ("" or missing -> []). */
export function parseListParam(v: string | null): string[] {
  return v ? v.split(',').filter(Boolean) : []
}

/** Set or delete a param on `params` (mutates in place): empty/null/undefined
 *  deletes the key, otherwise writes the value (arrays joined with commas). */
export function setParam(params: URLSearchParams, key: string, value: string | string[] | null | undefined) {
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
  if (empty) params.delete(key)
  else params.set(key, Array.isArray(value) ? value.join(',') : value)
}
