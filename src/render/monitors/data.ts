export interface MonitorData {
  values: Record<string, string | number>
  /** Normalised bar fill, 0..1. */
  bars: Record<string, number>
}
export interface MonitorOptions {
  /** Trusted inline host CSS, appended after the template styles. */
  styleText?: string
  /** Base refresh interval; template data-update-ms is used when omitted. */
  intervalMs?: number
  adaptive?: boolean
  secondary?: boolean
}
