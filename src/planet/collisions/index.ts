/**
 * Planet collision from GLB triangles.
 *
 * `chunks` bins triangles into a 32 m grid. `collisions` turns the nearby bins
 * into convex prisms on the Cannon world.
 */
export { planetCollisionChunks } from './chunks.js'
export { PlanetCollisions, type PlanetCollisionTile } from './collisions.js'
