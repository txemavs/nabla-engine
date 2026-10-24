# 19. Audio

[Manual contents](README.md)

Audio is driven by gameplay and presentation state: vehicle engine speed/load,
tires, gears, impacts, weapons, and music. Keep the source event separate from the
sound implementation. A sound failing to play must not prevent the corresponding
physics action from completing.

The mixer owns gain buses per audio context. `AudioMixLevels` currently contains
`master`, `engine`, `music`, and `musicMuted`. Although an `sfx` bus name exists,
the public mix object does not expose an independent `sfx` slider field; other
effects feed the master path. Avoid designing a settings UI from a type name alone.

## Browser integration

Browser audio startup depends on user interaction and context state. The browser
runtime accepts an initial `audio` preference and exposes `setAudioEnabled` and
mix controls. Background music is a host-supplied track configuration; its stream
starts through the runtime's gesture-aware path.

For a custom host, begin with audio disabled while validating scene and controls.
Enable it from a deliberate user action, then check master and per-category levels.
If music is absent but engine sound works, inspect the music URL, mute state, and
track lifecycle before changing the whole audio context.

## Vehicle and spatial sound

Vehicle voices include different engine families, starters, turbines, propellers,
tires, and incidental mechanical sounds. Recipes and telemetry choose the relevant
configuration. Spatial audio follows emitters/listener positions; incorrect frame
conversion can make a sound appear to move independently of its vehicle.

When introducing a sound, verify it at rest, under changing telemetry, across
camera modes, during pause, and after the source is removed. Disposal must stop
owned voices and connections. Repeated scene mounting must not accumulate duplicate
engines or music streams.

The current mixer defaults are master 1, engine 1, music 0.3, and music unmuted.
They are implementation defaults, not loudness calibration for every asset; the
source remains authoritative when these values change.

## Source of truth

- [Mixer](../../src/audio/mixer.ts).
- [Audio graph](../../src/audio/graph.ts) and [positional audio](../../src/audio/positional.ts).
- [Vehicle sound](../../src/audio/vehicle-sound.ts).
- [Music](../../src/audio/music.ts).
- [Browser audio integration](../../src/runtime/browser.ts).
