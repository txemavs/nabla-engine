/** A user-selected mode wins over the pre-session hardware hint. Capabilities are checked separately. */
export function arMode(search = location.search, ua = navigator.userAgent): 'mobile' | 'headset' {
  const selected = new URLSearchParams(search).get('arMode')
  if (selected === 'mobile' || selected === 'headset') return selected
  if (/Quest|Oculus|PicoBrowser|PICO/i.test(ua)) return 'headset'
  return /Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'headset'
}
