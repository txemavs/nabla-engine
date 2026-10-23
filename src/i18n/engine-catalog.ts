/** The engine's catalogs, registered on import: UI text (catalog.*.ts) and gameplay notices. */
import { registerCatalogs, type Catalogs } from './i18n.js'
import { engineEn } from './catalog.en.js'
import { engineEs } from './catalog.es.js'
import { engineEu } from './catalog.eu.js'
import { spanishMessages } from '../runtime/messages.es.js'
import { basqueMessages } from '../runtime/messages.eu.js'

/** Gameplay notices: the English template is the key and the English text. */
const notices: Catalogs = {
  en: Object.fromEntries(Object.keys(spanishMessages).map((key) => [key, key])),
  es: spanishMessages,
  eu: basqueMessages,
}

export const ENGINE_CATALOGS: Catalogs = {
  en: { ...notices.en, ...engineEn },
  es: { ...notices.es, ...engineEs },
  eu: { ...notices.eu, ...engineEu },
}

registerCatalogs(ENGINE_CATALOGS)
