/** Build-time physics and player tuning. Keep all consumers on the same values. */
export const simulationDefaults = Object.freeze({
  /** Fixed physics timestep, seconds. Changing this requires physics regression testing. */
  fixedStepSeconds: 1 / 60,
  /** Maximum fixed steps accepted from one elapsed-time submission. */
  maxSubsteps: 4,
  /** Host frame-duration cap in seconds before physics performs its own substep cap. */
  maxFrameSeconds: 0.1,
  /** Gravitational acceleration in metres per second squared. */
  gravity: 9.81,
  /** Rapier solver iterations per step; integer greater than zero. */
  solverIterations: 15,
  /** Dimensionless friction coefficient for solid scene bodies. */
  solidFriction: 0.55,
  /** Walking player's collider half-height and radius in metres. */
  playerHalfHeight: 0.9,
  playerRadius: 0.32,
  /** Walking and sprinting target speeds in metres per second. */
  walkSpeed: 4.2,
  sprintSpeed: 7,
  /** Horizontal acceleration on ground and in air, metres per second squared. */
  groundAcceleration: 35,
  airAcceleration: 9,
  /** Initial upward jump velocity, metres per second. */
  jumpSpeed: 5.5,
})

/** Conservative map collision streaming. Safety margins are in metres; budgets are soft. */
export const mapCollisionDefaults = Object.freeze({
  /** Resort deferred colliders at this interval in milliseconds. */
  reorderIntervalMs: 200,
  /** Travel margin for stale ordering, metres. */
  orderingMargin: 100,
  /** Colliders inside this distance bypass the soft cooking budget, metres. */
  criticalDistance: 80,
  /** Maximum noncritical collider creations per submission. */
  installCount: 4,
  /** Noncritical cooking time budget per submission, milliseconds. */
  installBudgetMs: 2,
  /** Additional coverage based on actor velocity, seconds. */
  lookAheadSeconds: 2,
  /** Refresh active map collider membership every this many fixed physics steps. */
  activationIntervalTicks: 15,
})
