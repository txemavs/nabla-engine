/** Per-runtime localization with English fallback; no process-wide language state. */
import { spanishMessages } from './messages.es.js'
export type RuntimeLocale = 'en' | 'es'
export type RuntimeText = (message: string, ...values: (string | number)[]) => string

/** Hosts may override individual templates. Missing translations retain readable English. */
export function createRuntimeText(
  locale: RuntimeLocale = 'en',
  overrides: Readonly<Record<string, string>> = {},
): RuntimeText {
  const messages = locale === 'es' ? { ...spanishMessages, ...overrides } : overrides
  return (message, ...values) =>
    (messages[message] ?? message).replace(/\{(\d+)\}/g, (token, index: string) =>
      String(values[Number(index)] ?? token),
    )
}
