import { describe, expect, it } from 'vitest'
import {
  offlinePageHtml,
  pwaHeadTags,
  serviceWorkerSource,
  webAppManifest,
} from '../../src/pwa/index.js'

const icons = [
  { src: '/pwa/icon-192.png', sizes: '192x192' },
  { src: '/pwa/icon-512.png', sizes: '512x512' },
  { src: '/pwa/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' as const },
]

describe('webAppManifest', () => {
  it('fills the installability fields with black, fullscreen defaults', () => {
    const manifest = webAppManifest({ name: 'App Name', shortName: 'App', icons })
    expect(manifest).toMatchObject({
      id: '/',
      name: 'App Name',
      short_name: 'App',
      start_url: '/',
      scope: '/',
      display: 'fullscreen',
      display_override: ['fullscreen', 'standalone'],
      theme_color: '#000000',
      background_color: '#000000',
    })
    expect(manifest.icons).toEqual(
      icons.map((icon) => ({ type: 'image/png', purpose: 'any', ...icon })),
    )
  })

  it('leaves display_override out for other display modes', () => {
    const manifest = webAppManifest({ name: 'A', shortName: 'A', icons, display: 'standalone' })
    expect(manifest).not.toHaveProperty('display_override')
  })
})

describe('serviceWorkerSource', () => {
  const options = {
    cacheName: 'app-v1',
    cachePrefix: 'app-',
    shell: ['/offline.html', '/manifest.webmanifest'],
    offlineUrl: '/offline.html',
  }

  it('embeds the shell and only handles same-origin GET requests', () => {
    const source = serviceWorkerSource(options)
    expect(source).toContain('"shell":["/offline.html","/manifest.webmanifest"]')
    expect(source).toContain("if (request.method !== 'GET') return;")
    expect(source).toContain('if (url.origin !== self.location.origin) return;')
    expect(() => new Function(source)).not.toThrow()
  })

  it('requires the offline page to be part of the shell', () => {
    expect(() => serviceWorkerSource({ ...options, shell: ['/manifest.webmanifest'] })).toThrow()
  })
})

describe('pwaHeadTags', () => {
  it('links the manifest, the iOS tags and registers the worker', () => {
    const head = pwaHeadTags({
      manifestUrl: '/manifest.webmanifest',
      serviceWorkerUrl: '/sw.js',
      appTitle: 'A "B"',
      appleTouchIcon: '/pwa/apple-touch-icon.png',
    })
    expect(head).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(head).toContain('<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png">')
    expect(head).toContain('content="A &quot;B&quot;"')
    expect(head).toContain('navigator.serviceWorker.register("/sw.js"')
    expect(head).toContain('beforeinstallprompt')
  })
})

describe('offlinePageHtml', () => {
  it('is a standalone page with the English texts and the others for the browser language', () => {
    const html = offlinePageHtml({
      appName: 'App <1>',
      texts: {
        en: { title: 'Offline', message: 'No connection', retry: 'Retry' },
        es: { title: 'Sin conexión', message: 'No hay red', retry: 'Reintentar' },
      },
    })
    expect(html).toContain('<title>App &lt;1&gt;</title>')
    expect(html).toContain('<h1 id="title">Offline</h1>')
    expect(html).toContain('"es":{"title":"Sin conexión"')
    expect(html).not.toMatch(/<(link|script) [^>]*src=/)
  })
})
