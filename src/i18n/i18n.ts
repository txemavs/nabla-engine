/**
 * UI text: one catalog per locale, English is the source. Engine modules and hosts call
 * `t(key, params)`; hosts add their own catalogs with `registerCatalogs` (later catalogs win, so a
 * host can also reword an engine key). The locale comes from `?locale=es|eu` (anything else, or
 * none, is English) unless a host sets it with `setLocale`.
 */
export const LOCALES = ['en', 'es', 'eu'] as const
export type Locale = (typeof LOCALES)[number]
export type Catalog = Readonly<Record<string, string>>
/** The same keys in every locale; `en` is the source of truth. */
export type Catalogs = Readonly<Record<Locale, Catalog>>
/** Named (`{name}`) or positional (`{0}`) values for a template. */
export type Params = Readonly<Record<string, string | number>> | readonly (string | number)[]

/** `?locale=es` / `?locale=eu`; `en`, anything else or nothing is English. */
export function localeFromSearch(search: string = globalThis.location?.search ?? ''): Locale {
  const value = new URLSearchParams(search).get('locale')
  return value === 'es' || value === 'eu' ? value : 'en'
}

/**
 * Look `key` up in `catalogs` for `locale`, fall back to English, then to the key itself, and fill
 * `{name}` / `{0}` from `params`. Self-contained on purpose: hosts may inline its source
 * (`translate.toString()`) in a classic script that cannot import modules.
 */
export function translate(
  catalogs: Readonly<Record<string, Catalog>>,
  locale: string,
  key: string,
  params?: Readonly<Record<string, string | number>> | readonly (string | number)[],
): string {
  const template = catalogs[locale]?.[key] ?? catalogs.en?.[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = (params as Record<string, string | number>)[name]
    return value === undefined ? token : String(value)
  })
}

/** Catalogs merged key by key, later ones winning. */
export function mergeCatalogs(...sets: readonly Catalogs[]): Catalogs {
  const merged = { en: {}, es: {}, eu: {} } as Record<Locale, Record<string, string>>
  for (const set of sets) for (const locale of LOCALES) Object.assign(merged[locale], set[locale])
  return merged
}

let catalogs: Catalogs = { en: {}, es: {}, eu: {} }
let chosen: Locale | null = null

/** Add catalogs (engine, then host); a key already present is overridden. */
export function registerCatalogs(...sets: readonly Catalogs[]): void {
  catalogs = mergeCatalogs(catalogs, ...sets)
}

/** The locale in use: the one set by {@link setLocale}, else the address. */
export function activeLocale(): Locale {
  return chosen ?? localeFromSearch()
}

/** Fix the locale (tests, hosts with their own setting); `null` goes back to the address. */
export function setLocale(locale: Locale | null): void {
  chosen = locale
}

/** UI text for `key` in the active locale. */
export function t(key: string, params?: Params): string {
  return translate(catalogs, activeLocale(), key, params)
}

/** Every registered catalog (for hosts that inline them and for tests). */
export function registeredCatalogs(): Catalogs {
  return catalogs
}

/** Set `<html lang>` to the active locale, so screen readers and hyphenation follow it. */
export function applyDocumentLocale(doc: Document | undefined = globalThis.document): void {
  if (doc) doc.documentElement.lang = activeLocale()
}

/**
 * Problems of a catalog set against its English source: a key missing or empty in a locale, a key
 * English lacks, or a `{param}` set differing from English. Empty when complete (tests use it).
 */
export function catalogGaps(set: Catalogs): string[] {
  const params = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)]
      .map((match) => match[1])
      .sort()
      .join(',')
  const gaps: string[] = []
  for (const locale of LOCALES) {
    for (const [key, english] of Object.entries(set.en)) {
      const text = set[locale][key]
      if (!text) gaps.push(`${locale}: missing ${key}`)
      else if (params(text) !== params(english)) gaps.push(`${locale}: params of ${key}`)
    }
    for (const key of Object.keys(set[locale]))
      if (!(key in set.en)) gaps.push(`${locale}: extra ${key}`)
  }
  return gaps
}
