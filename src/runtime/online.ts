/**
 * Versioned online presence client. The service owns membership; tracking poses
 * remain client observations and must never be treated as authoritative hits.
 */
import { z } from 'zod'

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
const rotation = z.tuple([
  z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(),
])
export const onlinePoseSchema = z.object({
  position: vector,
  rotation,
})
export const onlinePlaceSchema = z.object({
  kind: z.enum(['room', 'world']),
  label: z.string().min(1).max(100),
  origin: vector,
  geography: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    altitude: z.number().finite(),
  }).nullable(),
})
export const onlineGameSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(80),
  host: z.string().max(64),
  count: z.number().int().nonnegative(),
  place: onlinePlaceSchema,
})
const memberSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(40),
  tracking: z.boolean(),
  head: onlinePoseSchema.nullable(),
  left: onlinePoseSchema.nullable(),
  right: onlinePoseSchema.nullable(),
})
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lobby'), games: z.array(onlineGameSchema) }),
  z.object({
    type: z.literal('joined'), game: onlineGameSchema, playerId: z.string(), spawn: vector,
  }),
  z.object({
    type: z.literal('snapshot'), gameId: z.string(), tick: z.number().int(),
    members: z.array(memberSchema),
  }),
  z.object({ type: z.literal('left') }),
  z.object({ type: z.literal('error'), message: z.string().max(200) }),
])
export type OnlinePose = z.infer<typeof onlinePoseSchema>
export type OnlinePlace = z.infer<typeof onlinePlaceSchema>
export type OnlineGame = z.infer<typeof onlineGameSchema>
export type OnlineMember = z.infer<typeof memberSchema>
export type OnlineTracking = Pick<OnlineMember, 'tracking' | 'head' | 'left' | 'right'>
export type OnlineSocket = Pick<WebSocket,
  'readyState' | 'bufferedAmount' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'
>

/** Network-only client. No automatic connection, DOM, renderer or simulation. */
export class OnlineClient {
  games: OnlineGame[] = []
  game: OnlineGame | null = null
  members: OnlineMember[] = []
  playerId: string | null = null
  spawn: [number, number, number] = [0, 0, 0]
  status = 'Sin conexión'
  changed: () => void = () => {}
  joined: (game: OnlineGame) => void = () => {}
  private socket: OnlineSocket | null = null
  private sequence = 0
  snapshotTime = -Infinity
  private tick = -1
  private pending = false
  private disposed = false

  constructor(
    private readonly url: string,
    private readonly open: (url: string) => OnlineSocket = (address) => new WebSocket(address),
  ) {}

  /** Explicitly connect to the lobby. Repeated calls share the existing socket. */
  connect(): void {
    if (this.disposed || this.socket) return
    this.status = 'Conectando…'
    this.changed()
    try {
      const socket = this.open(this.url)
      this.socket = socket
      socket.onopen = () => {
        if (this.socket !== socket) return
        this.status = 'Online'
        this.changed()
      }
      socket.onmessage = (event) => {
        if (this.socket !== socket || typeof event.data !== 'string') return
        let raw: unknown
        try { raw = JSON.parse(event.data) } catch { return }
        const parsed = messageSchema.safeParse(raw)
        if (!parsed.success) return
        const message = parsed.data
        if (message.type === 'lobby') {
          this.games = message.games
          if (this.game) this.game = message.games.find((g) => g.id === this.game?.id) ?? this.game
        } else if (message.type === 'joined') {
          this.game = message.game
          this.playerId = message.playerId
          this.spawn = message.spawn
          this.members = []
          this.tick = -1
          this.sequence = 0
          this.pending = false
          this.status = 'En partida: ' + message.game.name
          this.joined(message.game)
        } else if (message.type === 'snapshot') {
          if (message.gameId !== this.game?.id || message.tick <= this.tick) return
          this.tick = message.tick
          this.members = message.members
          this.snapshotTime = performance.now()
          return
        } else if (message.type === 'left') {
          this.clearSession()
          this.status = 'Online'
        } else if (message.type === 'error') {
          this.pending = false
          this.status = message.message
        }
        this.changed()
      }
      socket.onclose = () => {
        if (this.socket !== socket) return
        this.socket = null
        this.games = []
        this.clearSession()
        this.status = 'Desconectado · vuelve a conectar'
        this.changed()
      }
      socket.onerror = () => {
        if (this.socket !== socket) return
        this.status = 'No se puede conectar al servicio online'
        this.changed()
      }
    } catch {
      this.socket = null
      this.status = 'No se puede conectar al servicio online'
      this.changed()
    }
  }

  create(name: string, playerName: string, place: OnlinePlace): void {
    const parsed = onlinePlaceSchema.safeParse(place)
    if (!parsed.success) return
    this.command({ type: 'create', name: name.trim().slice(0, 80) || 'Partida',
      playerName: playerName.trim().slice(0, 40) || 'Jugador', place: parsed.data })
  }

  join(id: string, playerName: string): void {
    this.command({ type: 'join', id, playerName: playerName.trim().slice(0, 40) || 'Jugador' })
  }

  leave(): void {
    if (!this.pending && this.game) this.command({ type: 'leave' })
  }

  private command(message: object): void {
    if (this.pending) return
    if (!this.socket || this.socket.readyState !== 1) {
      this.status = 'Conecta antes de crear o unirte'
      this.changed()
      return
    }
    this.pending = true
    this.socket.send(JSON.stringify({ v: 1, ...message }))
  }

  /** Drop obsolete tracking updates under backpressure; membership messages are reliable. */
  track(pose: OnlineTracking): void {
    if (!this.game || !this.socket || this.socket.readyState !== 1 ||
      this.socket.bufferedAmount > 16384) return
    this.socket.send(JSON.stringify({ v: 1, type: 'pose', seq: ++this.sequence, ...pose }))
  }

  private clearSession(): void {
    this.game = null
    this.playerId = null
    this.members = []
    this.pending = false
    this.tick = -1
  }

  dispose(): void {
    this.disposed = true
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
    this.games = []
    this.clearSession()
  }
}
