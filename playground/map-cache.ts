/** Shared byte-budgeted map cache. IndexedDB serializes writes across all map workers. */
const DB = 'nabla-map-cache-v1'
const MAX = 100_000_000
interface Entry {
  key: string
  blob: Blob
  headers: [string, string][]
  size: number
  used: number
}
let database: Promise<IDBDatabase> | undefined
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries', { keyPath: 'key' })
      r.result.createObjectStore('settings')
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => {
      database = undefined
      reject(r.error)
    }
  }))
}
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
function complete(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? Error('Cache transaction aborted'))
    tx.onerror = () => reject(tx.error)
  })
}
export async function mapCacheStats() {
  await migrate()
  const db = await open(),
    tx = db.transaction(['entries', 'settings']),
    done = complete(tx)
  const [entries, budget] = await Promise.all([
    request(tx.objectStore('entries').getAll()) as Promise<Entry[]>,
    request(tx.objectStore('settings').get('budget')),
  ])
  await done
  return {
    bytes: entries.reduce((n, e) => n + e.size, 0),
    entries: entries.length,
    budget: typeof budget === 'number' ? budget : MAX,
  }
}
export async function setMapCacheBudget(mb: number) {
  await migrate()
  if (!Number.isFinite(mb) || mb < 0 || mb > 100) throw Error('Map cache budget must be 0–100 MB')
  const db = await open(),
    tx = db.transaction(['entries', 'settings'], 'readwrite'),
    done = complete(tx)
  const store = tx.objectStore('entries'),
    budget = Math.floor(mb * 1_000_000)
  tx.objectStore('settings').put(budget, 'budget')
  store.getAll().onsuccess = (e) => {
    const entries = (e.target as IDBRequest<Entry[]>).result.sort((a, b) => a.used - b.used)
    let bytes = entries.reduce((n, x) => n + x.size, 0)
    for (const entry of entries) {
      if (bytes <= budget) break
      store.delete(entry.key)
      bytes -= entry.size
    }
  }
  await done
}
export async function clearMapCache() {
  await migrate()
  const db = await open(),
    tx = db.transaction('entries', 'readwrite'),
    done = complete(tx)
  tx.objectStore('entries').clear()
  await done
}
async function put(key: string, response: Response, retried = false) {
  const headers = new Headers(response.headers)
  headers.set('x-nabla-stored-at', String(Date.now()))
  const blob = await response.blob()
  if (blob.size > MAX) return
  const db = await open(),
    tx = db.transaction(['entries', 'settings'], 'readwrite'),
    done = complete(tx),
    store = tx.objectStore('entries')
  const setting = tx.objectStore('settings').get('budget')
  setting.onsuccess = () => {
    const budget = typeof setting.result === 'number' ? setting.result : MAX
    if (!budget || blob.size > budget) return
    store.getAll().onsuccess = (e) => {
      const entries = (e.target as IDBRequest<Entry[]>).result
        .filter((x) => x.key !== key)
        .sort((a, b) => a.used - b.used)
      let bytes = entries.reduce((n, x) => n + x.size, 0) + blob.size
      for (const entry of entries) {
        if (bytes <= budget) break
        store.delete(entry.key)
        bytes -= entry.size
      }
      store.put({
        key,
        blob,
        size: blob.size,
        used: Date.now(),
        headers: [...headers],
      } satisfies Entry)
    }
  }
  try {
    await done
  } catch (error) {
    if (retried || !(error instanceof DOMException) || error.name !== 'QuotaExceededError')
      throw error
    // Quota-aborted transactions roll back eviction too. Free space separately, then retry once.
    const cleanup = db.transaction('entries', 'readwrite'),
      finished = complete(cleanup),
      entries = cleanup.objectStore('entries')
    entries.getAll().onsuccess = (e) => {
      let freed = 0
      for (const entry of (e.target as IDBRequest<Entry[]>).result.sort(
        (a, b) => a.used - b.used,
      )) {
        entries.delete(entry.key)
        freed += entry.size
        if (freed >= Math.max(blob.size, 10_000_000)) break
      }
    }
    await finished
    await put(key, new Response(blob, { headers }), true)
  }
}
let migration: Promise<void> | undefined
async function migrate() {
  return (migration ??= (async () => {
    const work = async () => {
      const db = await open(),
        tx = db.transaction('settings'),
        done = complete(tx)
      const migrated = await request(tx.objectStore('settings').get('migrated'))
      await done
      if (migrated) return
      if (typeof caches !== 'undefined')
        for (const name of await caches.keys().catch(() => [])) {
          if (!/^nabla-(world|prepared|water)-v\d+$/.test(name)) continue
          if (['nabla-world-v3', 'nabla-prepared-v5', 'nabla-water-v1'].includes(name)) {
            const old = await caches.open(name)
            for (const key of await old.keys()) {
              const response = await old.match(key)
              if (response) await put(name + '|' + key.url, response).catch(() => {})
            }
          }
          await caches.delete(name)
        }
      const saved = db.transaction('settings', 'readwrite'),
        finished = complete(saved)
      saved.objectStore('settings').put(true, 'migrated')
      await finished
    }
    if (navigator.locks) await navigator.locks.request('nabla-map-cache-migration', work)
    else await work()
  })().catch((error) => {
    migration = undefined
    throw error
  }))
}
export function mapCache(namespace: string) {
  return {
    async match(url: string): Promise<Response | undefined> {
      await migrate()
      const db = await open(),
        tx = db.transaction('entries', 'readwrite'),
        done = complete(tx),
        store = tx.objectStore('entries')
      const r = store.get(namespace + '|' + new URL(url, location.origin).href)
      let entry: Entry | undefined
      r.onsuccess = () => {
        entry = r.result
        if (entry) store.put({ ...entry, used: Date.now() })
      }
      await done
      return entry ? new Response(entry.blob, { headers: entry.headers }) : undefined
    },
    async put(url: string, response: Response) {
      await migrate()
      await put(namespace + '|' + new URL(url, location.origin).href, response)
    },
  }
}
export type MapCache = ReturnType<typeof mapCache>
