export interface HoopBallSample {
  id: number
  position: { x: number; y: number; z: number }
  radius: number
  held: boolean
}
type Track = { position: HoopBallSample['position']; eligible: boolean; entered: boolean }
/** Local rim coordinates, Y up. Scores a free ball only after a downward passage
 * through the opening and full clearance below it. No collision solver lives here.
 */
export class HoopScoring {
  score = 0
  private readonly tracks = new Map<number, Track>()
  constructor(readonly innerRadius = 0.228) {
    if (!Number.isFinite(innerRadius) || innerRadius <= 0)
      throw new RangeError('Invalid rim radius')
  }
  sample(balls: readonly HoopBallSample[]): number {
    const live = new Set(balls.map((ball) => ball.id))
    for (const id of this.tracks.keys()) if (!live.has(id)) this.tracks.delete(id)
    let added = 0
    for (const ball of balls) {
      const p = ball.position,
        r = ball.radius
      if (
        ball.held ||
        ![p.x, p.y, p.z, r].every(Number.isFinite) ||
        r <= 0 ||
        r >= this.innerRadius
      ) {
        this.tracks.delete(ball.id)
        continue
      }
      const track = this.tracks.get(ball.id)
      if (!track) {
        this.tracks.set(ball.id, { position: { ...p }, eligible: p.y > r + 0.02, entered: false })
        continue
      }
      const previous = track.position
      if (p.y > r + 0.02) track.eligible = true
      if (p.y > 0) track.entered = false
      if (track.eligible && previous.y > 0 && p.y <= 0 && p.y < previous.y) {
        const t = previous.y / (previous.y - p.y)
        const x = previous.x + (p.x - previous.x) * t,
          z = previous.z + (p.z - previous.z) * t
        track.entered = Math.hypot(x, z) <= this.innerRadius - r
        track.eligible = false
      }
      if (track.entered && p.y < -r - 0.02) {
        this.score++
        added++
        track.entered = false
      }
      track.position = { ...p }
    }
    return added
  }
  resetTracking(): void {
    this.tracks.clear()
  }
  reset(): void {
    this.score = 0
    this.resetTracking()
  }
}
