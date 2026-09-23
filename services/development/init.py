"""Initialize only development volumes. Never import the live queue here."""
import os
import secrets
from pathlib import Path

for name in ('/data', '/publish', '/secrets'):
    path = Path(name)
    path.mkdir(exist_ok=True)
    os.chown(path, 1000, 1000)
path = Path('/secrets/prepare-token')
if not path.exists():
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(secrets.token_urlsafe(32))
os.chown(path, 1000, 1000)
print('Development volumes ready; activation secret preserved.', flush=True)

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
