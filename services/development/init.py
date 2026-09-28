"""Initialize Studio dependency volumes; planet-setup owns publisher data and secrets."""
import os
from pathlib import Path

# Match the host checkout owner for hot reload and generated build outputs.
uid, gid = int(os.environ.get('DEV_UID', '1000')), int(os.environ.get('DEV_GID', '1000'))
for name in ('/dependencies', '/npm-cache'):
    path = Path(name)
    if path.stat().st_uid != uid or path.stat().st_gid != gid:
        for directory, directories, files in os.walk(path):
            os.chown(directory, uid, gid)
            for entry in files:
                os.chown(Path(directory) / entry, uid, gid, follow_symlinks=False)
        os.chown(path, uid, gid)
