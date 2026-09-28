"""Initialize only development volumes. Never import the live queue here."""
import os
import hashlib
import hmac
import time
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
# Only the loopback development gateway receives this signed session. The browser
# never receives the owner token; production still requires explicit activation.
expires = str(int(time.time()) + 365 * 86400)
signature = hmac.new(path.read_text().strip().encode(), expires.encode(), hashlib.sha256).hexdigest()
proxy = Path('/secrets/development-session.conf')
proxy.write_text(f'proxy_set_header Cookie "nabla_prepare={expires}.{signature}";\n')
os.chmod(proxy, 0o600)
print('Development volumes ready; local generation enabled.', flush=True)
