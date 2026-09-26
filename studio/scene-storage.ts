const DB = 'nabla-scenes'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scenes')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function readScene(key: string): Promise<string | null> {
  const value = localStorage.getItem(key)
  if (value !== '{"storage":"indexeddb"}') return value
  const db = await open()
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction('scenes'),
        request = tx.objectStore('scenes').get(key)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
/** Large streamed snapshots need more room than localStorage's small synchronous quota. */
export async function writeScene(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value)
    return
  } catch {
    /* Use IndexedDB below. */
  }
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('scenes', 'readwrite')
      tx.objectStore('scenes').put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar'))
    })
    localStorage.setItem(key, '{"storage":"indexeddb"}')
  } finally {
    db.close()
  }
}
