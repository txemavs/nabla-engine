"""Read-only queue inspection: do not construct Queue (it recovers running jobs)."""
import json
import sqlite3
from pathlib import Path

path = Path('/data/prepare.sqlite')
if not path.exists():
    print('Queue is not initialized yet.')
else:
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        counts = dict(db.execute('SELECT state, count(*) FROM planet_jobs GROUP BY state'))
        print(json.dumps(counts, indent=2))
        for row in db.execute('SELECT tile, state, attempts FROM planet_jobs ORDER BY updated DESC LIMIT 30'):
            print(f"{row['tile']:24} {row['state']:10} attempts={row['attempts']}")
