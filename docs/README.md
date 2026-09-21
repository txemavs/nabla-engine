# Documentation

This documentation describes the working 0.2.0 baseline. The playground keeps its
Spanish interface; UI labels are quoted where needed to locate a control.

| Guide                                       | Read it to…                                                      |
| ------------------------------------------- | ---------------------------------------------------------------- |
| [Controls](controls.md)                     | Edit, drive, latch cargo, fly and select location/time           |
| [Architecture](architecture.md)             | Understand ownership, units, scene validation and simulation     |
| [Vehicle assets](vehicle-assets.md)         | Understand the original models, mounts and carrier physics       |
| [Geography](geography.md)                   | Understand GPS, maps, planetary scale, horizon and the sky clock |
| [Agency integration](agency-integration.md) | Consume the engine without bringing host conventions into it     |
| [Asset provenance](../assets/README.md)     | Locate the original artwork and its sources                      |
| [Contributing](../CONTRIBUTING.md)          | Run checks and make reviewable changes                           |
| [Changelog](../CHANGELOG.md)                | Review the scope of this baseline                                |

Portals are intentionally outside this snapshot. They should preserve the current
edit/play contract, one physics-world owner and explicit coordinate conversions.
