/**
 * Scenery physics: bodies for small streamed scenery (sign posts, traffic-light poles) that
 * only exist near the player. Code-only defaults; the player's choices live in the menu
 * (Mundo → Opciones → Física de señalización) and are applied through `SceneryPhysics`.
 */
export const sceneryPhysicsDefaults = Object.freeze({
  /** Signs and poles respond to impacts. */
  enabled: true,
  /** Metres around the player inside which scenery gets a physics body. */
  radius: 30,
  /** Editable range of `radius`, metres. */
  radiusMin: 5,
  radiusMax: 150,
  /** Most live bodies per layer (signs, traffic lights, …). */
  maxBodies: 48,
})
