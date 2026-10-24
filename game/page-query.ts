import { preferenceQueryKeys } from '../src/runtime/settings-backup.js'
/**
 * The page's effective query and the address the game writes back. A host may set both before
 * the game modules run (an earlier module script calls setPageQuery), e.g. a closed demo that
 * plays a fixed query while the address bar stays bare. Otherwise the real location is used.
 * Kept on a global symbol so every module copy sees the same host.
 */
export interface PageQuery {
  /** The query string the game reads, with its leading `?` (or ''). */
  search(): string
  /** The address to show for `value` (a query or a path) when the game rewrites the URL. */
  address?(value: string): string
}

const QUERY = Symbol.for('nabla.pageQuery')
type Holder = { [QUERY]?: PageQuery }

export function setPageQuery(query: PageQuery): void {
  ;(globalThis as Holder)[QUERY] = query
}

/** The query the game reads: the host's, else `location.search` ('' outside a browser). */
export function pageSearch(): string {
  return (globalThis as Holder)[QUERY]?.search() ?? globalThis.location?.search ?? ''
}

/** The address to write for `value`: the host's, else `value` itself. */
export function pageAddress(value: string): string {
  return (globalThis as Holder)[QUERY]?.address?.(value) ?? value
}

/** Overlay only portable preferences on a host's fixed scene query; never import a new world. */
export function mergePagePreferences(base: string, overrides: string): string {
  const result = new URLSearchParams(base)
  for (const [key, value] of new URLSearchParams(overrides))
    if (preferenceQueryKeys.has(key)) result.set(key, value)
  return result.size ? '?' + result.toString() : ''
}
