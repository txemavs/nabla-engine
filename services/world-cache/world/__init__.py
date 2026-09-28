"""Tile library imported by `service/server.py`.

See README.md in this directory. Subpackages:

- `osm` — ask OpenStreetMap for a box and parse the answer
- `bake` — static JSON zones (not the live planet)
- `queue` — cells someone asked to generate
- `planet` — publish one cell as GLBs
- `photo` — JPEG of a finished cell, top-down
- `map` — page that shows those JPEGs and can request a cell
- `status` — numbers shown on the operator page
"""
