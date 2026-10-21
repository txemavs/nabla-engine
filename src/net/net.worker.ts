/** Module worker entry for `NetWorker`: one relay connection per worker. */
import { serveNetWorker, type NetWorkerPort } from './net-worker-host.js'

serveNetWorker(self as unknown as NetWorkerPort)
