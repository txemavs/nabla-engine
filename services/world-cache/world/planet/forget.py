"""Drop published cells inside one Web Mercator tile. Preview and GLB go together."""
import re
import shutil
from pathlib import Path


def parse_tile(address):
    match = re.fullmatch(r'z/([1-9]|1[0-5])/(0|[1-9]\d*)/(0|[1-9]\d*)', address)
    if not match:
        raise ValueError('Expected z/zoom/x/y')
    z, x, y = (int(part) for part in match.groups())
    if x >= 2**z or y >= 2**z:
        raise ValueError('Tile outside WebMercatorQuad')
    return z, x, y


def forget_zone(publish, queue, address):
    z, x, y = parse_tile(address)
    publish = Path(publish)
    removed = []
    base = publish / 'z'
    if base.is_dir():
        for manifest in base.glob('*/*/*/manifest.json'):
            parts = manifest.relative_to(base).parts
            cz, cx, cy = (int(part) for part in parts[:3])
            if cz < z:
                continue
            shift = cz - z
            if (cx >> shift) != x or (cy >> shift) != y:
                continue
            cell = manifest.parent
            shutil.rmtree(cell, ignore_errors=True)
            photo = publish / 'photos' / 'z' / parts[0] / parts[1] / f'{parts[2]}.jpg'
            photo.unlink(missing_ok=True)
            removed.append(cell.relative_to(publish).as_posix())
    if queue is not None and removed:
        queue.forget(removed)
    return removed
