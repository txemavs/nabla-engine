/** Standard Gamepad mapping: mode 2, left stick altitude/yaw; right stick pitch/roll. */
export function deadzone(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= 0.12) return 0
  return Math.sign(value) * Math.min(1, (Math.abs(value) - 0.12) / 0.88)
}
export function gamepadAxes(pad: Pick<Gamepad, 'axes' | 'buttons'>, flight: boolean) {
  const axis = (i: number) => deadzone(pad.axes[i] ?? 0)
  return {
    forward: flight ? -axis(3) : (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0),
    right: flight ? axis(2) : axis(0),
    lift: flight ? -axis(1) : 0,
    turn: flight ? axis(0) : 0,
    brake: Boolean(pad.buttons[5]?.pressed),
  }
}
