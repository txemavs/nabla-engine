"""Top-down photograph of a published cell.

A finished cell already has terrain and building GLBs. This package reads those
meshes and writes `preview.jpg` beside the manifest: one JPEG per cell, zoom
13, 14 or 15. The server exposes that file as a slippy-map tile.
"""
