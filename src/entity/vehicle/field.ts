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
    hubs: z.union([
      z.tuple([vector, vector, vector, vector]),
      z.tuple([vector, vector, vector, vector, vector, vector]),
    ]),
    /** Unpowered trailer, excluded from player boarding. */
    passive: z.boolean().optional(),
    tow: z
      .object({ vehicleId: z.string().min(1), anchor: vector, hitch: vector })
      .strict()
      .optional(),
    wheelRadius: finite.min(0.05).max(1.5),
    suspensionRest: finite.min(0.02).max(1),
    /** Metres of travel each side of the rest length. Default 0.3. */
    suspensionTravel: finite.min(0.05).max(1.2).optional(),
    stiffness: finite.min(5).max(200),
    engineForce: finite.positive().max(100000),
    /** Front hubs are 0/1; rear hubs 2/3. Omitted keeps rear-wheel drive. */
    drivenWheels: z.enum(['front', 'rear', 'all']).optional(),
    /** Optional automatic powertrain. Power is metric horsepower (CV), torque is N·m. */
    powertrain: z
      .object({
        powerCv: finite.min(20).max(2000),
        torqueNm: finite.min(20).max(3000),
        ratios: z.array(finite.min(0.2).max(6)).min(1).max(10),
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
  })
  .strict()

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
    /** Optional individual wheel models in hub order (front left/right, rear left/right). */
    wheels: z
      .union([
        z.tuple([assetPart, assetPart, assetPart, assetPart]),
        z.tuple([assetPart, assetPart, assetPart, assetPart, assetPart, assetPart]),
      ])
      .optional(),
    steering: assetPart.optional(),
    wheelRotations: z
      .union([
        z.tuple([rotation, rotation, rotation, rotation]),
        z.tuple([rotation, rotation, rotation, rotation, rotation, rotation]),
      ])
      .optional(),
  })
  .strict()

export type VehicleDefinition = z.infer<typeof vehicleField>
export type VisualDefinition = z.infer<typeof visualField>
