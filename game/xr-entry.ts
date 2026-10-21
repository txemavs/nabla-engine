import { pageSearch } from './page-query.js'
import { hasVehiclePreset } from '@nabla/engine/vehicles'
/** XR uses the same host and runtime as test.html and Euskadi. No second simulation. */
const params = new URLSearchParams(pageSearch())
const destinations = document.querySelector<HTMLDetailsElement>('#xr-destinations')!
destinations.open = !params.has('terrain') && !params.has('example')
if (params.get('tile') === '16224/11998')
  destinations.querySelector('summary')!.textContent = 'Escenario: Zaisa · Z15'
const tests = document.querySelector('#xr-vehicle-tests')!
for (const [vehicle, label] of [
  ['car', 'Coche'],
  ...(hasVehiclePreset('bmw') ? [['bmw', 'BMW low poly']] : []),
  ['vfr800', 'Moto · automática'],
  ['vfr800-quest', 'Moto low poly · Quest'],
  ['white-truck', 'Camión sin remolque'],
  ['forklift-rc', 'Toro y palets'],
  ['carrier', 'Nave'],
]) {
  const row = document.createElement('div')
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px'
  for (const terrain of [false, true]) {
    const query = new URLSearchParams({ vehicle, solo: '1', quality: 'minimal', diagnostics: '1' })
    if (terrain) {
      for (const [key, value] of Object.entries({
        terrain: '/terrain',
        tile: '16224/11998',
        photo: 'lo',
        relief: 'engine',
        time: '12:00',
      }))
        query.set(key, value)
    } else query.set('example', 'flat')
    const link = document.createElement('a')
    link.href = `/xr.html?${query}`
    link.textContent = `${label} · ${terrain ? 'Zaisa' : 'pista'}`
    row.append(link)
  }
  tests.append(row)
}
const fleet = document.createElement('div')
fleet.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px'
for (const copies of hasVehiclePreset('bmw') ? [1, 5, 10, 20] : []) {
  const link = document.createElement('a')
  link.href = `/xr.html?example=flat&solo=1&vehicle=bmw&copies=${copies}&quality=minimal&diagnostics=1`
  link.textContent = `${copies} BMW · pista`
  fleet.append(link)
}
tests.append(fleet)
const ar = document.createElement('a')
ar.href = '/ar.html'
ar.textContent = 'Realidad mixta · prueba de habitación'
tests.append(ar)
if (params.get('solo') === '1')
  destinations.querySelector('summary')!.textContent =
    `Prueba individual: ${({ car: 'Coche', bmw: 'BMW', vfr800: 'Moto', 'vfr800-quest': 'Moto Quest', 'white-truck': 'Camión', carrier: 'Nave' } as Record<string, string>)[params.get('vehicle') ?? 'car'] ?? 'Vehículo'} · ${params.has('terrain') ? 'Zaisa' : 'pista'}`
params.set('xr', '1')
if (![...params.keys()].some((key) => ['terrain', 'tiles', 'api', 'static'].includes(key)))
  params.set('example', 'flat')
if (!params.has('quality')) params.set('quality', 'minimal')
history.replaceState(null, '', `${location.pathname}?${params}`)
await import('./main.js')
export {}
