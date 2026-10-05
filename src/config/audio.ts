/** Synthesized reversing alarm defaults; enabled per vehicle with vehicle.reverseAlarm. */
export const reverseAlarmDefaults = Object.freeze({
  /** Warning tone frequency in hertz. */
  frequencyHz: 950,
  /** Linear gain, deliberately below the engine voice. */
  gain: 0.035,
  /** Seconds between beep starts and duration of each beep. */
  intervalSeconds: 0.85,
  durationSeconds: 0.3,
  /** Short envelope ramps prevent clicks. */
  rampSeconds: 0.015,
})
