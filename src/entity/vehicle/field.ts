import { z } from 'zod'
import { boxCollider, finite, rotation, transform, vector } from '../coords.js'

const assetPart = z
  .object({
    url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/),
    transform,
  })
  .strict()

/** Per-hub configuration for N-wheel vehicles. */
const hubConfig = z
  .object({
    position: vector,
    steered: z.boolean().optional(),
    driven: z.boolean().optional(),
    radius: finite.min(0.05).max(1.5).optional(),
  })
  .strict()

/** Trailer coupling configuration for tractor vehicles. */
const trailerCoupling = z
  .object({
    /** Fifth wheel anchor position on the tractor. */
    anchor: vector,
    /** Kingpin position on the trailer (relative to trailer origin). */
    kingpin: vector,
    /** Yaw limits in radians [min, max]. */
    limits: z.tuple([finite.min(-Math.PI).max(0), finite.max(Math.PI).min(0)]).optional(),
  })
  .strict()

/** Chassis, hubs, and the optional cabin, garage and flight flag. */
export const vehicleField = z
  .object({
    colliders: z.array(boxCollider).min(1).max(32),
    /** Legacy 4-wheel format: front hubs 0/1 steer, drivenWheels selects driven axle. */
    hubs: z.tuple([vector, vector, vector, vector]).optional(),
    /** Extended format: per-hub configuration for N wheels. */
    hubConfigs: z.array(hubConfig).min(2).max(12).optional(),
    wheelRadius: finite.min(0.05).max(1.5),
    suspensionRest: finite.min(0.02).max(1),
    /** Metres of travel each side of the rest length. Default 0.3. */
    suspensionTravel: finite.min(0.05).max(1.2).optional(),
    stiffness: finite.min(5).max(200),
    engineForce: finite.positive().max(100000),
    /** Legacy driven-axle selector for 4-wheel vehicles. Ignored if hubConfigs is used. */
    drivenWheels: z.enum(['front', 'rear', 'all']).optional(),
    /** Optional automatic powertrain. Power is metric horsepower (CV), torque is N·m. */
    powertrain: z
      .object({
        powerCv: finite.min(20).max(2000),
        torqueNm: finite.min(20).max(3000),
        ratios: z.array(finite.min(0.2).max(15)).min(1).max(16),
        finalDrive: finite.min(1).max(8),
        grip: finite.min(0.5).max(8),
      })
      .strict()
      .optional(),
    brakeForce: finite.positive().max(1000),
    driver: vector,
    cameraDistance: finite.min(2).max(30),
    /** Optional driver-local eye offset. */
    headOffset: vector.optional(),
    /** Vertical mirror tilt in degrees; omitted uses -2 degrees. */
    mirrorTilt: finite.min(-5).max(12).optional(),
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
    /** Trailer coupling for tractor vehicles. */
    trailer: trailerCoupling.optional(),
  })
  .strict()
  .refine((data) => data.hubs || data.hubConfigs, {
    message: 'Either hubs or hubConfigs must be provided',
  })

/** GLB body, wheels, steering wheel and ramp nodes. Asset names are not physics. */
export const visualField = z
  .object({
    body: assetPart,
    /** Host-registered presentation adapter. Omit for a plain model without equipment. */
    presentation: z
      .string()
      .regex(/^[a-zA-Z0-9._-]{1,80}$/)
      .optional(),
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
    /** Legacy 4-wheel rotations. */
    wheelRotations: z.tuple([rotation, rotation, rotation, rotation]).optional(),
    /** Extended N-wheel rotations (use instead of wheelRotations for >4 wheels). */
    hubRotations: z.array(rotation).min(2).max(12).optional(),
  })
  .strict()

export type VehicleDefinition = z.infer<typeof vehicleField>
export type VisualDefinition = z.infer<typeof visualField>
