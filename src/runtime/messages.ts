/**
 * Gameplay notices (toasts, HUD hints, touch labels). Their keys are the English templates, so a
 * call site reads as the text it shows; Spanish and Basque live in messages.es.ts / messages.eu.ts
 * and are part of the engine catalogs (src/i18n).
 */
import { activeLocale, registeredCatalogs, translate, type Locale } from '../i18n/i18n.js'
import '../i18n/engine-catalog.js'

export type RuntimeLocale = Locale
export type RuntimeText = (message: string, ...values: (string | number)[]) => string

/**
 * Text function for one runtime. `locale` defaults to the page locale (`?locale=`); hosts may
 * override individual templates. Missing translations keep readable English.
 */
export function createRuntimeText(
  locale: RuntimeLocale = activeLocale(),
  overrides: Readonly<Record<string, string>> = {},
): RuntimeText {
  return (message, ...values) =>
    message in overrides
      ? translate({ en: overrides }, 'en', message, values)
      : translate(registeredCatalogs(), locale, message, values)
}
