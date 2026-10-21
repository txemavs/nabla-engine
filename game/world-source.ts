/**
 * What the player stands on: geographic terrain tiles, the flat test ground, or one model
 * (a GLB world such as a scenario). A host picks it (DriveHost.world); pages default by path.
 */
export type WorldSource =
  | { kind: 'terrain' }
  | { kind: 'flat' }
  /** `url` is unset while the host lets the player choose the model. */
  | { kind: 'model'; url?: string }

/** test.html and xr.html play on the flat ground; every other page on terrain. */
export function defaultWorldSource(pathname = globalThis.location?.pathname ?? '/'): WorldSource {
  return pathname === '/test.html' || pathname === '/xr.html'
    ? { kind: 'flat' }
    : { kind: 'terrain' }
}

export function hasTerrain(world: WorldSource): boolean {
  return world.kind === 'terrain'
}
