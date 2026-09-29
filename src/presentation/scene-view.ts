import { SceneView as Renderer, type SceneViewOptions } from '../render/entity/view.js'
import { stockVehiclePresentation } from '../catalog/presentation/road-vehicles.js'
import { s3Instruments } from '../catalog/monitors/s3-instruments.js'
import type { SceneDocument } from '../scene/document.js'

export type { SceneViewOptions } from '../render/entity/view.js'
export type {
  CarInstrumentDefinition,
  CarInstrumentTelemetry,
} from '../render/entity/car-instrument-definition.js'

/** Public ready-to-use presenter. Composition lives outside the generic renderer.
 * Existing scenes/imports retain their displays; hosts can replace the recipe or pass null.
 */
export class SceneView extends Renderer {
  constructor(
    document: SceneDocument,
    experimentalLargeScene = false,
    validated = false,
    options: SceneViewOptions = {},
  ) {
    super(document, experimentalLargeScene, validated, {
      carInstruments: s3Instruments,
      vehiclePresentation: stockVehiclePresentation,
      ...options,
    })
  }
}
