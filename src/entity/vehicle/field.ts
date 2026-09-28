import { z } from 'zod'
import { boxCollider, finite, rotation, transform, vector } from '../coords.js'

const assetPart = z
  .object({
    url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/),
    transform,
  })
  .strict()

/** Chassis, four hubs, and the optional cabin, garage and flight flag. */
export const vehicleField = z
  .object({
    colliders: z.array(boxCollider).min(1).max(32),
    hubs: z.tuple([vector, vector, vector, vector]),
    wheelRadius: finite.min(0.05).max(1.5),
    suspensionRest: finite.min(0.02).max(1),
    /** Metres of travel each side of the rest length. Default 0.3. */
    suspensionTravel: finite.min(0.05).max(1.2).optional(),
    stiffness: finite.min(5).max(200),
    engineForce: finite.positive().max(100000),
    /** `all` drives every hub. Omitted keeps the rear axle. */
    drivenWheels: z.enum(['rear', 'all']).optional(),
    brakeForce: finite.positive().max(1000),
    driver: vector,
    cameraDistance: finite.min(2).max(30),
    flight: z.boolean().optional(),
    /** Light airplane: plane-helm uses wing lift instead of the carrier's cruise. */
    plane: z.boolean().optional(),
    boat: z.boolean().optional(),
    interior: z.object({ min: vector, max: vector, exit: vector }).strict().optional(),
    garage: z
      .object({
        min: vector,
        max: vector,
        ramp: z
          .object({
            colliderIndex: z.number().int().min(0).max(31),
            hinge: vector,
            closeAngle: finite.min(-Math.PI).max(Math.PI),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/** GLB body, wheels, steering wheel and ramp nodes. Asset names are not physics. */
export const visualField = z
  .object({
    body: assetPart,
    ramp: z
      .object({
        nodes: z.array(z.string()).min(1).max(8),
        hinge: vector,
        closeAngle: finite.min(-Math.PI).max(Math.PI),
      })
      .strict()
      .optional(),
    wheel: assetPart.optional(),
    steering: assetPart.optional(),
    wheelRotations: z.tuple([rotation, rotation, rotation, rotation]).optional(),
  })
  .strict()

export type VehicleDefinition = z.infer<typeof vehicleField>
export type VisualDefinition = z.infer<typeof visualField>
