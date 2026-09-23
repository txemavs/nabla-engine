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
