/**
 * Theme values for UI drawn outside CSS (canvas panels in XR, the hoop). They mirror the colour
 * tokens of styles/tokens.css; keep both in step (test/ui/styles.test.ts checks it).
 */
export const interfaceTheme = {
  surface: '#1e1e1e',
  button: '#252525',
  accent: '#f5f5f5',
  background: '#121212',
  ink: '#eeeeee',
  muted: '#a6a6a6',
  line: '#444444',
  selected: '#3a3a3a',
  pressed: '#303030',
  radius: 2,
  textSize: 20,
  controlHeight: 36,
  press: 0,
} as const
