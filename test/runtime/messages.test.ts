import { expect, it } from 'vitest'
import { createRuntimeText } from '../../src/runtime/messages.js'

it('isolates language and overrides between simultaneous runtime hosts', () => {
  const english = createRuntimeText()
  const spanish = createRuntimeText('es')
  const custom = createRuntimeText('es', { 'Lights on': 'Headlamps enabled' })
  expect(english('Lights on')).toBe('Lights on')
  expect(spanish('Lights on')).toBe('Luces encendidas')
  expect(spanish('Steering wheel')).toBe('Volante')
  expect(spanish('Accelerator')).toBe('Acelerador')
  expect(spanish('Handbrake')).toBe('Freno de mano')
  expect(spanish('Touch controls')).toBe('Controles táctiles')
  expect(custom('Lights on')).toBe('Headlamps enabled')
  expect(spanish('Lights on')).toBe('Luces encendidas')
  expect(spanish('Unknown message')).toBe('Unknown message')
  expect(spanish('Gallery · {0}/{1} · {2} s · N restart', 2, 3, 45)).toBe(
    'Galería · 2/3 · 45 s · N reiniciar',
  )
  expect(
    spanish(
      'E exit · C camera · H lights · G GPS · K high/low · Z/X indicators · F9 wheel diagnostics',
    ),
  ).toBe(
    'E salir · C cámara · H luces · G GPS · K cortas/largas · Z/X intermitentes · F9 diagnóstico de ruedas',
  )
})
