import type { PlanetPhoto } from '../../planet/contract.js'
import {
  computeTileClusters,
  type TileClusterInput,
  type TileClusterOutput,
} from './cluster-culling.js'
import { decodePackagePhoto, type PhotoMark } from './package-photo.js'
import type { AtlasPackagePort } from './atlas-package-loader.js'

/**
 * Tile loading work that may leave the main thread: package photo download + SHA-256 + decode, and
 * the cluster-culling reorder. {@link mainThreadLoading} runs it in place (WebGL, unchanged);
 * {@link WorkerLoading} runs the very same functions in a module worker (WebGPU only).
 */
export interface TileLoading {
  photo(
    url: string,
    photo: Pick<PlanetPhoto, 'bytes' | 'sha256'>,
    mark?: PhotoMark,
  ): Promise<ImageBitmap>
  clusters(input: TileClusterInput): Promise<TileClusterOutput>
}

export const mainThreadLoading: TileLoading = {
  photo: decodePackagePhoto,
  clusters: async (input) => computeTileClusters(input),
}

type Job =
  | { type: 'photo'; url: string; photo: Pick<PlanetPhoto, 'bytes' | 'sha256'> }
  | { type: 'clusters'; input: TileClusterInput }
type JobResult = ImageBitmap | TileClusterOutput
/** Photo phase marks travel with every reply, so a failed photo still reports its timings. */
type Reply =
  | { id: number; ok: true; result: JobResult; marks: [string, number][] }
  | { id: number; ok: false; message: string; marks: [string, number][] }

const isBitmap = (value: unknown): value is ImageBitmap =>
  typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap

/** Every buffer a cluster job reads or returns, to transfer instead of copy. */
function clusterBuffers(value: TileClusterInput | TileClusterOutput): Transferable[] {
  const arrays: ArrayBufferView[] = []
  if ('positions' in value) arrays.push(value.positions)
  else arrays.push(value.clusters.starts, value.clusters.counts, value.clusters.bounds)
  if (value.index) arrays.push(value.index)
  for (const attribute of value.attributes ?? []) arrays.push(attribute.array)
  return [...new Set(arrays.map((array) => array.buffer as ArrayBuffer))]
}

/** Worker side: answer jobs on `port` with the main-thread functions. */
export function serveTileLoading(
  port: AtlasPackagePort & { postMessage(m: unknown, t: Transferable[]): void },
): void {
  port.addEventListener('message', (event: MessageEvent<{ id: number; job: Job }>) => {
    const { id, job } = event.data
    const marks: [string, number][] = []
    const work = async (): Promise<{ result: JobResult; transfer: Transferable[] }> => {
      if (job.type === 'photo') {
        const bitmap = await decodePackagePhoto(job.url, job.photo, (name, ms) =>
          marks.push([name, ms]),
        )
        return { result: bitmap, transfer: isBitmap(bitmap) ? [bitmap] : [] }
      }
      const result = computeTileClusters(job.input)
      return { result, transfer: clusterBuffers(result) }
    }
    work().then(
      ({ result, transfer }) =>
        port.postMessage({ id, ok: true, result, marks } satisfies Reply, transfer),
      (error: unknown) =>
        port.postMessage(
          {
            id,
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            marks,
          } satisfies Reply,
          [],
        ),
    )
  })
}

/** Main-thread proxy that runs {@link TileLoading} jobs in a worker. */
export class WorkerLoading implements TileLoading {
  private nextId = 1
  private readonly waiting = new Map<number, (reply: Reply) => void>()

  constructor(
    private readonly port: AtlasPackagePort & { postMessage(m: unknown, t: Transferable[]): void },
  ) {
    port.addEventListener('message', (event: MessageEvent<Reply>) => {
      const done = this.waiting.get(event.data.id)
      this.waiting.delete(event.data.id)
      done?.(event.data)
    })
  }

  private run(job: Job, transfer: Transferable[], mark?: PhotoMark): Promise<JobResult> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (reply) => {
        for (const [name, ms] of reply.marks) mark?.(name, ms)
        if (reply.ok) resolve(reply.result)
        else reject(new Error(reply.message))
      })
      this.port.postMessage({ id, job }, transfer)
    })
  }

  async photo(url: string, photo: Pick<PlanetPhoto, 'bytes' | 'sha256'>, mark?: PhotoMark) {
    return (await this.run(
      { type: 'photo', url, photo: { bytes: photo.bytes, sha256: photo.sha256 } },
      [],
      mark,
    )) as ImageBitmap
  }

  /** The input's buffers are transferred: pass copies (see `tileClusterInput(…, copy)`). */
  async clusters(input: TileClusterInput) {
    return (await this.run({ type: 'clusters', input }, clusterBuffers(input))) as TileClusterOutput
  }
}

let shared: WorkerLoading | undefined
/** One shared module worker for photo and cluster jobs; created on first use. */
export function workerLoading(): TileLoading {
  shared ??= new WorkerLoading(
    new Worker(new URL('./loading.worker.ts', import.meta.url), { type: 'module' }),
  )
  return shared
}
