# Asset provenance

Bundled artwork is kept separate from engine code and served by the reference
host. Do not regenerate or recolor original source files to adjust presentation.

| Files                            | Source                                                                                                                 | Use                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `brand/source.svg`               | [txemavs/nabla-hacs](https://github.com/txemavs/nabla-hacs/blob/main/custom_components/nabla_control/brand/source.svg) | Official metallic blue hollow Nabla mark; app header, favicon and README |
| `world/car.audi.a3.cabrio.glb`   | This repository, commit `6a22576`                                                                                      | Original body and interior                                               |
| `world/car.audi.a3.wheel.glb`    | This repository, commit `6a22576`                                                                                      | Four wheel instances                                                     |
| `world/car.audi.a3.steering.glb` | This repository, commit `6a22576`                                                                                      | Steering wheel                                                           |
| `world/ship.container.5x10.glb`  | This repository, commit `6a22576`                                                                                      | Carrier, cabin, garage and ramp                                          |
| `geography/agency-ground.jpg`    | Agency UI, commit `89b0907`, `src/assets/stage/ground.jpg`                                                             | Authored road/ground image                                               |
| `geography/earth.jpg`            | Agency UI, commit `89b0907`, `src/assets/stage/earth.jpg`                                                              | Local globe texture                                                      |

Vehicle files were recovered from branch
`cursor/drive-playground-boxcar-ship5x10-7b21` without changing their bytes.
Geographic images were copied unchanged from the local Agency source checkout.
The logo was retrieved unchanged from the user-specified source, revision
`f7856aa7709e1507c8905a5db4541fd88746ebbb`. Its Git blob is
`a106b37b4216c68fa25b107a459952ecbe6c822f`, matching the upstream file.

External satellite tiles come from Esri World Imagery; street tiles come from
CARTO/© OpenStreetMap. They are downloaded at runtime, not bundled. Attribution
links remain visible in the viewport. Refer to those providers for their data
terms. The repository's MIT code license does not transfer third-party trademark
or imagery rights.
