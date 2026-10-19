import { serveAtlasPackages, type AtlasPackagePort } from './atlas-package-loader.js'

serveAtlasPackages(self as unknown as AtlasPackagePort)
