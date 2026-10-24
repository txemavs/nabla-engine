/** Scene simulation and session lifetime without browser presentation or an owned clock. */
export { Simulation, FIXED_STEP, idleInput } from './simulation.js'
export type { PlayerInput, PlayerSnapshot } from './simulation.js'
export { initPhysics } from './physics.js'
export { PlaySession, type PlayOptions, type SessionState } from '../runtime/session.js'
