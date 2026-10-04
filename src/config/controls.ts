/** Input tuning shared by keyboard/gamepad mixing and browser mouse look. */
export const controlDefaults = Object.freeze({
  /** Normalized stick magnitude ignored near rest; must remain in [0, 1). */
  gamepadDeadzone: 0.12,
  /** Mouse rotation in radians per CSS movement pixel. */
  mouseSensitivity: 0.003,
  /** Absolute vertical look limit in radians. */
  pitchLimit: 1.4,
  /** Keyboard steering rise time constant in seconds; must be positive. */
  steeringRiseSeconds: 0.4,
  /** Release/countersteer time constant in seconds; must be positive. */
  steeringReleaseSeconds: 0.12,
  /** Ignore frame stalls above this many seconds when smoothing input. */
  steeringMaxStepSeconds: 0.1,
  /** Snap residual normalized steering to zero below this magnitude. */
  steeringSnapThreshold: 0.001,
})
