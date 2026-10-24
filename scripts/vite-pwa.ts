/**
 * Vite plugin that makes a game page an installable web app with the `@nabla/engine/pwa`
 * builders: it serves (dev) and emits (build) `/manifest.webmanifest`, `/sw.js`,
 * `/offline.html` and the icon files, and adds the PWA `<head>` tags to the chosen pages.
 *
 * ```ts
 * nablaPwa({ manifest: { name, shortName, icons: [...] }, iconsDir, appleTouchIcon, offline })
 * ```
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Plugin } from 'vite'
import {
  offlinePageHtml,
  pwaHeadTags,
  serviceWorkerSource,
  webAppManifest,
  type OfflinePageOptions,
  type PwaManifestOptions,
} from '../src/pwa/index.js'

export interface NablaPwaOptions {
  /** Manifest fields; icon `src` values are file names in `iconsDir`, served under `iconsRoute`. */
  manifest: PwaManifestOptions
  /** Folder holding the PNG icons named by the manifest, `appleTouchIcon` and `favicon`. */
  iconsDir: string
  /** URL folder of the icons. Default `/pwa/`. */
  iconsRoute?: string
  /** 180×180 PNG file name in `iconsDir`. */
  appleTouchIcon: string
  /** Optional PNG favicon file name in `iconsDir`. */
  favicon?: string
  /** Offline page texts and colours; the app name is the manifest name. */
  offline: Omit<OfflinePageOptions, 'appName'> & { icon?: string }
  /** Pages that get the head tags. Default the root document (`/` and `/index.html`). */
  pages?: (path: string) => boolean
  /** Cache name prefix of the service worker. Default `nabla-pwa-`. */
  cachePrefix?: string
}

const MANIFEST_URL = '/manifest.webmanifest'
const SERVICE_WORKER_URL = '/sw.js'
const OFFLINE_URL = '/offline.html'

interface PwaFile {
  url: string
  type: string
  body: string | Buffer
}

/** Every file the plugin serves, keyed by URL. */
export function pwaFiles(options: NablaPwaOptions): Map<string, PwaFile> {
  const route = (options.iconsRoute ?? '/pwa/').replace(/\/?$/, '/')
  const iconNames = new Set(
    [
      ...options.manifest.icons.map((icon) => icon.src),
      options.appleTouchIcon,
      options.favicon,
      options.offline.icon,
    ].filter((name): name is string => !!name),
  )
  const files = new Map<string, PwaFile>()
  for (const name of iconNames) {
    if (name !== basename(name)) throw new Error(`nablaPwa: icon ${name} must be a file name`)
    const file = join(options.iconsDir, name)
    if (!existsSync(file)) throw new Error(`nablaPwa: missing icon ${file}`)
    files.set(route + name, { url: route + name, type: 'image/png', body: readFileSync(file) })
  }
  const manifest = webAppManifest({
    ...options.manifest,
    icons: options.manifest.icons.map((icon) => ({ ...icon, src: route + icon.src })),
  })
  files.set(MANIFEST_URL, {
    url: MANIFEST_URL,
    type: 'application/manifest+json',
    body: JSON.stringify(manifest, null, 2) + '\n',
  })
  const { icon, ...offline } = options.offline
  files.set(OFFLINE_URL, {
    url: OFFLINE_URL,
    type: 'text/html; charset=utf-8',
    body: offlinePageHtml({
      ...offline,
      appName: options.manifest.name,
      iconUrl: offline.iconUrl ?? (icon ? route + icon : undefined),
    }),
  })
  const shell = [...files.keys()].sort()
  const version = createHash('sha256')
  for (const url of shell) version.update(url).update(files.get(url)!.body)
  const prefix = options.cachePrefix ?? 'nabla-pwa-'
  files.set(SERVICE_WORKER_URL, {
    url: SERVICE_WORKER_URL,
    type: 'text/javascript; charset=utf-8',
    body: serviceWorkerSource({
      cacheName: prefix + version.digest('hex').slice(0, 12),
      cachePrefix: prefix,
      shell,
      offlineUrl: OFFLINE_URL,
    }),
  })
  return files
}

export function nablaPwa(options: NablaPwaOptions): Plugin {
  const route = (options.iconsRoute ?? '/pwa/').replace(/\/?$/, '/')
  const isPage = options.pages ?? ((path: string) => path === '/' || path === '/index.html')
  const head = pwaHeadTags({
    manifestUrl: MANIFEST_URL,
    serviceWorkerUrl: SERVICE_WORKER_URL,
    themeColor: options.manifest.themeColor,
    appTitle: options.manifest.shortName,
    appleTouchIcon: route + options.appleTouchIcon,
    icon: options.favicon ? route + options.favicon : undefined,
  })
  let files: Map<string, PwaFile> | undefined
  const current = () => (files ??= pwaFiles(options))
  return {
    name: 'nabla-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const file = current().get((req.url ?? '').split('?', 1)[0])
        if (!file) return next()
        res.setHeader('Content-Type', file.type)
        // The worker and manifest must be revalidated so updates reach installed apps.
        res.setHeader('Cache-Control', 'no-cache')
        if (file.url === SERVICE_WORKER_URL) res.setHeader('Service-Worker-Allowed', '/')
        res.end(req.method === 'HEAD' ? undefined : file.body)
      })
    },
    generateBundle() {
      for (const file of current().values())
        this.emitFile({ type: 'asset', fileName: file.url.slice(1), source: file.body })
    },
    transformIndexHtml(html, ctx) {
      if (!isPage(ctx.path)) return html
      return html.includes('</head>') ? html.replace('</head>', head + '</head>') : head + html
    },
  }
}
