import { serveTileLoading } from './loading-workers.js'

serveTileLoading(self as unknown as Parameters<typeof serveTileLoading>[0])
