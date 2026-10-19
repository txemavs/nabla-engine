import { validateAtlasZ15Package, type AtlasZ15Package } from '../../planet/atlas-z15.js'
import type { MapTile } from '../../scene/mercator.js'
import { sha256 } from '../../util/sha256.js'

/** One `nabla-z15-package/1` download: where it is and what manifest.json says it must be. */
export interface AtlasPackageRequest {
  url: string
  tile: MapTile
  bytes: number
  sha256: string
  cors?: boolean
}

/** Why a package load failed, without the URL prefix the caller adds. `status` is set for `http`. */
export class AtlasPackageFailure extends Error {
  constructor(
    message: string,
    readonly kind: 'http' | 'invalid',
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AtlasPackageFailure'
  }
}

/**
 * Fetches, size- and SHA-256-verifies, parses and validates an Atlas package.
 * {@link mainThreadAtlasPackageLoader} is the default; {@link WorkerAtlasPackageLoader} does the
 * same work off the main thread and is only chosen for the WebGPU backend.
 */
export interface AtlasPackageLoader {
  load(request: AtlasPackageRequest, signal?: AbortSignal): Promise<AtlasZ15Package>
}

/** The package load itself. Shared verbatim by the main-thread loader and the worker. */
export async function loadAtlasPackage(
  request: AtlasPackageRequest,
  signal?: AbortSignal,
): Promise<AtlasZ15Package> {
  const timeout = AbortSignal.timeout(15000)
  const response = await fetch(request.url, {
    method: 'GET',
    mode: request.cors === false ? undefined : 'cors',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new AtlasPackageFailure('', 'http', response.status)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== request.bytes)
    throw new AtlasPackageFailure('size does not match manifest.json', 'invalid')
  if ((await sha256(bytes)) !== request.sha256)
    throw new AtlasPackageFailure('SHA-256 does not match manifest.json', 'invalid')
  return validateAtlasZ15Package(JSON.parse(new TextDecoder().decode(bytes)), request.tile)
}

export const mainThreadAtlasPackageLoader: AtlasPackageLoader = { load: loadAtlasPackage }

/** Minimal message port shape shared by `Worker`, `DedicatedWorkerGlobalScope` and `MessagePort`. */
export interface AtlasPackagePort {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

type LoaderRequest =
  { id: number; type: 'load'; request: AtlasPackageRequest } | { id: number; type: 'cancel' }
type LoaderReply =
  | { id: number; ok: true; pkg: AtlasZ15Package }
  | {
      id: number
      ok: false
      name: string
      message: string
      kind?: 'http' | 'invalid'
      status?: number
    }

/** Worker side: answer load requests on `port` with {@link loadAtlasPackage}. */
export function serveAtlasPackages(port: AtlasPackagePort): void {
  const pending = new Map<number, AbortController>()
  port.addEventListener('message', (event: MessageEvent<LoaderRequest>) => {
    const message = event.data
    if (message.type === 'cancel') {
      pending.get(message.id)?.abort()
      return
    }
    const controller = new AbortController()
    pending.set(message.id, controller)
    loadAtlasPackage(message.request, controller.signal)
      .then(
        (pkg) => port.postMessage({ id: message.id, ok: true, pkg } satisfies LoaderReply),
        (error: unknown) =>
          port.postMessage({
            id: message.id,
            ok: false,
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof AtlasPackageFailure
              ? { kind: error.kind, status: error.status }
              : {}),
          } satisfies LoaderReply),
      )
      .finally(() => pending.delete(message.id))
  })
}

/** Main-thread proxy that runs {@link loadAtlasPackage} in a worker. Errors keep their kind and status. */
export class WorkerAtlasPackageLoader implements AtlasPackageLoader {
  private nextId = 1
  private readonly waiting = new Map<
    number,
    { resolve: (pkg: AtlasZ15Package) => void; reject: (error: unknown) => void }
  >()

  constructor(private readonly port: AtlasPackagePort) {
    port.addEventListener('message', (event: MessageEvent<LoaderReply>) => {
      const reply = event.data
      const entry = this.waiting.get(reply.id)
      if (!entry) return
      this.waiting.delete(reply.id)
      if (reply.ok) return entry.resolve(reply.pkg)
      const error = reply.kind
        ? new AtlasPackageFailure(reply.message, reply.kind, reply.status)
        : new Error(reply.message)
      if (!reply.kind) error.name = reply.name
      entry.reject(error)
    })
  }

  load(request: AtlasPackageRequest, signal?: AbortSignal): Promise<AtlasZ15Package> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    const id = this.nextId++
    return new Promise<AtlasZ15Package>((resolve, reject) => {
      const abort = () => {
        if (!this.waiting.delete(id)) return
        this.port.postMessage({ id, type: 'cancel' } satisfies LoaderRequest)
        reject(signal!.reason)
      }
      this.waiting.set(id, {
        resolve: (pkg) => (signal?.removeEventListener('abort', abort), resolve(pkg)),
        reject: (error) => (signal?.removeEventListener('abort', abort), reject(error)),
      })
      signal?.addEventListener('abort', abort, { once: true })
      this.port.postMessage({ id, type: 'load', request } satisfies LoaderRequest)
    })
  }
}

let shared: WorkerAtlasPackageLoader | undefined
/** One shared module worker for package loads; created on first use. */
export function workerAtlasPackageLoader(): AtlasPackageLoader {
  shared ??= new WorkerAtlasPackageLoader(
    new Worker(new URL('./atlas-package.worker.ts', import.meta.url), { type: 'module' }),
  )
  return shared
}
