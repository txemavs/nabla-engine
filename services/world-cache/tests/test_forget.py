from world.planet.forget import forget_zone
from world.queue.store import Queue


def test_forget_zone_drops_the_cell_and_its_children(tmp_path):
    publish = tmp_path / 'pub'
    inside = publish / 'z' / '15' / '4' / '5'
    outside = publish / 'z' / '15' / '8' / '5'
    for cell in (inside, outside):
        cell.mkdir(parents=True)
        (cell / 'manifest.json').write_text('{}')
        (cell / 'terrain.glb').write_text('mesh')
    photo = publish / 'photos' / 'z' / '15' / '4'
    photo.mkdir(parents=True)
    (photo / '5.jpg').write_bytes(b'jpeg')
    queue = Queue(tmp_path / 'queue.sqlite', output=publish)
    assert queue.enqueue(['z/15/4/5']) == 1
    removed = forget_zone(publish, queue, 'z/13/1/1')
    assert removed == ['z/15/4/5']
    assert queue.stats().get('queued', 0) == 0
    assert not inside.exists()
    assert not (photo / '5.jpg').exists()
    assert (outside / 'manifest.json').is_file()
