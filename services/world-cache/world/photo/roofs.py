"""One satellite photo per cell, three zooms finer, for roof projection."""
import io
import json
import urllib.request
from pathlib import Path

from PIL import Image

SPAN = 8


def mosaic(tile):
    zoom = tile['z'] + 3
    image = Image.new('RGB', (SPAN * 256, SPAN * 256))
    for row in range(SPAN):
        for col in range(SPAN):
            url = (
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'
                f"{zoom}/{tile['y'] * SPAN + row}/{tile['x'] * SPAN + col}"
            )
            request = urllib.request.Request(url, headers={'User-Agent': 'NablaPlanet/1.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                piece = Image.open(io.BytesIO(response.read())).convert('RGB')
            image.paste(piece, (col * 256, row * 256))
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=80)
    return out.getvalue()


def write_roof(cell):
    """Write roof.jpg beside the manifest. Leave an existing photo alone."""
    cell = Path(cell)
    target = cell / 'roof.jpg'
    if target.is_file() and target.stat().st_size > 1000:
        return False
    manifest = json.loads((cell / 'manifest.json').read_text())
    temporary = cell / '.roof.jpg.tmp'
    temporary.write_bytes(mosaic(manifest['tile']))
    temporary.replace(target)
    return True
