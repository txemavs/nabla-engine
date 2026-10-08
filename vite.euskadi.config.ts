/**
 * Euskadi Online closed demo: nabla-engine terrain game (engine/ on main) with
 * - Atlas Z15 packages proxied at /tiles (and /terrain/); the public bucket has no CORS.
 * - Coded setup from ./demo-config.ts: game modules see a fixed search string; the address
 *   bar stays at `/` (query strings are stripped). Engine URL params still work for other hosts.
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { Agent as HttpAgent } from 'node:http'
import { basename, extname, join, resolve } from 'node:path'
import { Agent as HttpsAgent } from 'node:https'
import {
  defineConfig,
  mergeConfig,
  type Plugin,
  type ProxyOptions,
  type UserConfig,
} from 'vite'
import game from './vite.game.config.ts'
import { demoQuery, TILES_ROUTE, FLIP_CINEMATIC } from './demo-config.ts'
import { EUSKADI_BOOT, euskadiBootScript } from './euskadi-boot.ts'
import { EUSKADI_BRAND_HTML, euskadiHudHead } from './euskadi-hud.ts'

const upstream = new URL(
  process.env.EUSKADI_TILES_UPSTREAM ?? 'https://atlas.chained.world/euskadi/terraform',
)
const route = process.env.EUSKADI_TILES_ROUTE ?? TILES_ROUTE

// Tile proxy transport (2026-10-06 fix for /tiles/... 502 after restart).
// atlas.chained.world is CloudFront; DNS answers AAAA first but the container has no IPv6 route.
// Node 22's happy-eyeballs gives each address 250 ms, so during the start-up burst of tile requests
// the IPv4 connects miss that window and the proxy fails with `AggregateError [ETIMEDOUT]`.
// Pin IPv4 and keep TLS connections alive. CloudFront also answers 403 to requests without a
// User-Agent, so the proxy adds one when the client did not send it.
const agentOptions = { keepAlive: true, family: 4, maxSockets: 32 }
const upstreamAgent =
  upstream.protocol === 'https:' ? new HttpsAgent(agentOptions) : new HttpAgent(agentOptions)
const TILES_USER_AGENT = 'euskadi-online-tiles-proxy'
const closedSearch = '?' + (process.env.EUSKADI_DEMO_QUERY ?? demoQuery(route))

// Boot splash (nabla-engine #111 window.NABLA_BOOT). The closed demo strips ?boot= from the
// address bar and rewrites location.search, so A/B testing goes through this env instead:
// EUSKADI_BOOT=attract (default) | classic (no orbit) | off (engine default).
// euskadiBootScript() also emits the host splash <style> (black + Nabla mark first, then attract).
const bootMode = process.env.EUSKADI_BOOT ?? 'attract'
const nablaBootScript =
  bootMode === 'off'
    ? ''
    : euskadiBootScript({
        ...EUSKADI_BOOT,
        attract: bootMode !== 'classic',
        flipCinematic: FLIP_CINEMATIC,
        splash: { ...EUSKADI_BOOT.splash, layout: bootMode === 'classic' ? 'centered' : 'corner' },
      })

function euskadiClosedDemo(): Plugin {
  return {
    name: 'euskadi-closed-demo',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || !req.url) return next()
        const [path, search = ''] = req.url.split('?', 2)
        // `/index.html?html-proxy&index=N.js` is Vite's own URL for inline module scripts in the
        // page (the HUD clock module); only real query strings go back to the bare address.
        const viteInternal = /(?:^|&)html-proxy(?:&|$)/.test(search)
        if ((path === '/' || path === '/index.html') && search && !viteInternal) {
          res.statusCode = 302
          res.setHeader('Location', path === '/index.html' ? '/index.html' : '/')
          res.end()
          return
        }
        next()
      })
    },
    transform(code, id) {
      if (!id.includes('/game/') || id.includes('node_modules')) return
      if (!id.endsWith('.ts') && !id.endsWith('.js')) return
      let next = code
      if (next.includes('location.search')) {
        next =
          `const __euskadiClosedSearch = ${JSON.stringify(closedSearch)};\n` +
          next.replace(/location\.search/g, '__euskadiClosedSearch')
      }
      // Host HUD (euskadi-hud.ts clock + place) needs the GameRuntime. The engine only exposes
      // window.nablaRuntime with ?diagnostics, so hand it over as window.euskadiRuntime right
      // after construction (before attract), without the diagnostics overhead.
      if (id.endsWith('/game/terrain-main.ts')) {
        next = next.replace(
          /bootLog\((['"])GameRuntime construct done\1\);?/,
          (hit) => `${hit} window.euskadiRuntime = runtime;`,
        )
      }
      // Never push the demo query into the address bar.
      next = next.replace(
        /history\.replaceState\(\s*null\s*,\s*""\s*,\s*entry\.search\s*\|\|\s*location\.pathname\s*\)/g,
        'history.replaceState(null, "", location.pathname)',
      )
      if (next === code) return
      return { code: next, map: null }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        // Keep the full game document; strip a leftover query and set window.NABLA_BOOT
        // (classic <head> script, so it runs before the deferred module main.ts).
        const boot =
          '<script>(() => { if (location.href.includes("?")) history.replaceState(null, "", location.pathname); })();</script>' +
          nablaBootScript +
          euskadiHudHead()
        // Top-left brand in the markup itself: visible from first paint, same spot as in game.
        const withBrand = html.replace(/<body([^>]*)>/, (body) => body + EUSKADI_BRAND_HTML)
        if (withBrand.includes('</head>')) return withBrand.replace('</head>', `${boot}</head>`)
        return boot + withBrand
      },
    },
  }
}

// Background music (NABLA_BOOT.music in euskadi-boot.ts). The files live in the euskadi repo
// under music/; build-static.sh and the compose file put them at ./euskadi-music next to this
// config. Served at /music/ with Range support (the <audio> element streams and loops) and
// copied into the static build.
const MUSIC_DIR = resolve(process.env.EUSKADI_MUSIC_DIR ?? 'euskadi-music')
const MUSIC_TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
}

function musicFiles(): string[] {
  if (!existsSync(MUSIC_DIR)) return []
  return readdirSync(MUSIC_DIR).filter((name) => MUSIC_TYPES[extname(name).toLowerCase()])
}

function euskadiMusic(): Plugin {
  return {
    name: 'euskadi-music',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?', 1)[0] ?? ''
        if (!url.startsWith('/music/')) return next()
        const name = basename(decodeURIComponent(url))
        const type = MUSIC_TYPES[extname(name).toLowerCase()]
        const file = join(MUSIC_DIR, name)
        if (!type || !existsSync(file)) return next()
        const size = statSync(file).size
        res.setHeader('Content-Type', type)
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
          const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
          if (start > end || start >= size) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${size}`)
            res.end()
            return
          }
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
          res.setHeader('Content-Length', String(end - start + 1))
          createReadStream(file, { start, end }).pipe(res)
          return
        }
        res.setHeader('Content-Length', String(size))
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const name of musicFiles())
        this.emitFile({
          type: 'asset',
          fileName: `music/${name}`,
          source: readFileSync(join(MUSIC_DIR, name)),
        })
    },
  }
}

export default defineConfig(async (env) => {
  const base = (typeof game === 'function' ? await game(env) : game) as UserConfig
  const tilesProxy = (prefix: string): ProxyOptions => ({
    target: upstream.origin,
    changeOrigin: true,
    agent: upstreamAgent,
    proxyTimeout: 60_000,
    rewrite: (path: string) =>
      upstream.pathname.replace(/\/$/, '') + path.replace(new RegExp(`^${prefix}`), ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (!proxyReq.getHeader('user-agent')) proxyReq.setHeader('user-agent', TILES_USER_AGENT)
      })
    },
  })
  return mergeConfig(base, {
    plugins: [euskadiClosedDemo(), euskadiMusic()],
    server: {
      proxy: {
        [route]: tilesProxy(route),
        '^/terrain/': tilesProxy('/terrain'),
      },
    },
  } satisfies UserConfig)
})
