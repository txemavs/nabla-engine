/** Pure rules for the Settings navigation tree; settings-hud applies them to the DOM. */
export interface NavSection {
  readonly id: string
  readonly title: string
  /** Navigation group id, or undefined for a top-level entry. */
  readonly group?: string
}

/**
 * Sections that share a title inside one group read as duplicates in the tree: they are merged
 * into the first one. Returns, for each kept section id, the ids folded into it (in order).
 */
export function sectionMerges(sections: readonly NavSection[]): Map<string, string[]> {
  const first = new Map<string, string>(),
    merges = new Map<string, string[]>()
  for (const s of sections) {
    const key = `${s.group ?? ''}\u0000${s.title.trim().toLowerCase()}`
    const keep = first.get(key)
    if (keep === undefined) first.set(key, s.id)
    else merges.set(keep, [...(merges.get(keep) ?? []), s.id])
  }
  return merges
}

/** Problems a navigation tree must not have: duplicate titles in a group or empty titles. */
export function navIssues(sections: readonly NavSection[]): string[] {
  const issues: string[] = []
  for (const [keep, ids] of sectionMerges(sections))
    issues.push(`duplicate title in group: ${keep} ← ${ids.join(', ')}`)
  for (const s of sections) if (!s.title.trim()) issues.push(`empty title: ${s.id}`)
  return issues
}
