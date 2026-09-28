"""Read and fill the official chained.world map. Stdlib only, SigV4."""
import hashlib
import hmac
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

CELL = re.compile(r'z/(13|14|15)/\d+/\d+')
TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.glb': 'model/gltf-binary',
}


def enabled():
    return _settings() is not None


def _clean(value):
    return (value or '').replace('\r', '').strip()


def _settings():
    bucket = _clean(os.environ.get('ATLAS_BUCKET', ''))
    key = _clean(os.environ.get('AWS_ACCESS_KEY_ID', ''))
    secret = _clean(os.environ.get('AWS_SECRET_ACCESS_KEY', ''))
    if not bucket or not key or not secret:
        return None
    region = _clean(os.environ.get('ATLAS_REGION') or os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION') or 'eu-west-1')
    return bucket, region, key, secret, _clean(os.environ.get('AWS_SESSION_TOKEN', ''))


def _cell(address):
    if not CELL.fullmatch(address):
        raise ValueError('Expected z/13|14|15/x/y')
    return address


def content_type(name):
    return TYPES.get(Path(name).suffix.lower(), 'application/octet-stream')


def _canonical_query(query):
    pairs = []
    for part in (query or '').split('&'):
        if not part:
            continue
        name, _, value = part.partition('=')
        name = urllib.parse.quote(urllib.parse.unquote(name), safe='-_.~')
        value = urllib.parse.quote(urllib.parse.unquote(value), safe='-_.~')
        pairs.append((name, value))
    pairs.sort()
    return '&'.join(f'{name}={value}' for name, value in pairs)


def _sign(method, key, query, body, headers):
    bucket, region, access, secret, token = _settings()
    host = f'{bucket}.s3.{region}.amazonaws.com'
    now = datetime.now(timezone.utc)
    amz = now.strftime('%Y%m%dT%H%M%SZ')
    day = amz[:8]
    payload = hashlib.sha256(body or b'').hexdigest()
    signed = {
        'host': host,
        'x-amz-content-sha256': payload,
        'x-amz-date': amz,
    }
    if token:
        signed['x-amz-security-token'] = token
    signed.update({name.lower(): value for name, value in (headers or {}).items()})
    names = ';'.join(sorted(signed))
    canonical_headers = ''.join(f'{name}:{signed[name]}\n' for name in sorted(signed))
    query = _canonical_query(query)
    canonical = f'{method}\n/{urllib.parse.quote(key, safe="/")}\n{query}\n{canonical_headers}\n{names}\n{payload}'
    scope = f'{day}/{region}/s3/aws4_request'
    string = f'AWS4-HMAC-SHA256\n{amz}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'

    def mac(key_bytes, message):
        return hmac.new(key_bytes, message.encode(), hashlib.sha256).digest()

    signing = mac(mac(mac(mac(('AWS4' + secret).encode(), day), region), 's3'), 'aws4_request')
    signature = hmac.new(signing, string.encode(), hashlib.sha256).hexdigest()
    signed['authorization'] = f'AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={names}, Signature={signature}'
    url = f'https://{host}/{urllib.parse.quote(key, safe="/")}'
    if query:
        url += '?' + query
    return url, signed


def _call(method, key, query='', body=None, headers=None):
    url, signed = _sign(method, key, query, body, headers)
    request = urllib.request.Request(url, data=body, headers=signed, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def _list(prefix):
    query = 'list-type=2&prefix=' + urllib.parse.quote(prefix, safe='')
    status, body = _call('GET', '', query)
    if status != 200:
        return []
    root = ElementTree.fromstring(body)
    return [node.text for node in root.iter() if node.tag.endswith('Key') and node.text]


def read(key):
    """One object from the bucket. None when S3 is off or the key is absent."""
    if not enabled() or not key or key.startswith('/') or '..' in key.split('/'):
        return None
    try:
        status, body = _call('GET', key)
    except (OSError, urllib.error.URLError, ValueError):
        return None
    if status != 200:
        return None
    return body


def pull(directory, only=None):
    """Copy one published cell from the bucket onto disk. False when it is absent or S3 is off.

    `only` limits which filenames land on disk. The map needs the manifest and the preview,
    not the GLBs.
    """
    if not enabled():
        return False
    directory = Path(directory)
    address = _cell('/'.join(directory.parts[-4:]))
    prefix = address + '/'
    try:
        keys = [key for key in _list(prefix) if key.startswith(prefix)]
    except (OSError, urllib.error.URLError, ValueError):
        return False
    names = []
    for key in keys:
        name = key[len(prefix):]
        if name and '/' not in name and not name.startswith('.') and (only is None or name in only):
            names.append((key, name))
    if not any(name == 'manifest.json' for _, name in names):
        return False
    directory.mkdir(parents=True, exist_ok=True)
    for key, name in names:
        status, body = _call('GET', key)
        if status != 200:
            return False
        temporary = directory / (name + '.s3tmp')
        temporary.write_bytes(body)
        temporary.replace(directory / name)
    return (directory / 'manifest.json').is_file()


def _put_all(directory):
    """PUT every file. Returns (newly sent, every file is in the bucket)."""
    directory = Path(directory)
    address = _cell('/'.join(directory.parts[-4:]))
    sent = 0
    durable = True
    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.name.startswith('.'):
            continue
        body = path.read_bytes()
        status, _ = _call(
            'PUT', f'{address}/{path.name}', body=body,
            headers={'if-none-match': '*', 'content-type': content_type(path.name)},
        )
        if status in (200, 201):
            sent += 1
        elif status != 412:
            durable = False
    return sent, durable


def replace_manifest(directory):
    """Write the local manifest over the bucket copy. The GLB names changed."""
    if not enabled():
        return False
    directory = Path(directory)
    address = _cell('/'.join(directory.parts[-4:]))
    body = (directory / 'manifest.json').read_bytes()
    status, _ = _call(
        'PUT', f'{address}/manifest.json', body=body,
        headers={'content-type': 'application/json'},
    )
    return status in (200, 201)


def push(directory):
    """Upload files that the bucket does not have yet. Existing keys stay as they are."""
    if not enabled():
        return 0
    sent, _ = _put_all(directory)
    return sent


def complete(directory):
    """Upload missing files. True only when every file is already in the bucket."""
    if not enabled():
        return False
    _, durable = _put_all(directory)
    return durable


def archived(directory):
    """True when this cell's manifest is already in the bucket."""
    if not enabled():
        return False
    directory = Path(directory)
    address = _cell('/'.join(directory.parts[-4:]))
    try:
        keys = _list(address + '/')
    except (OSError, urllib.error.URLError, ValueError):
        return False
    return f'{address}/manifest.json' in keys


def _each(prefix):
    token = ''
    while True:
        query = 'list-type=2&prefix=' + urllib.parse.quote(prefix, safe='')
        if token:
            query += '&continuation-token=' + urllib.parse.quote(token, safe='')
        status, body = _call('GET', '', query)
        if status != 200:
            raise RuntimeError(f'list {status}')
        root = ElementTree.fromstring(body)
        for node in root.iter():
            if node.tag.endswith('Key') and node.text:
                yield node.text
        truncated = next((node.text for node in root.iter() if node.tag.endswith('IsTruncated')), None)
        token = next((node.text for node in root.iter() if node.tag.endswith('NextContinuationToken')), None)
        if truncated != 'true' or not token:
            return


def retype():
    """Set Content-Type on objects already in the bucket. Bytes stay the same."""
    if not enabled():
        return 0
    bucket = _settings()[0]
    changed = 0
    for key in _each('z/'):
        mime = content_type(key)
        if mime == 'application/octet-stream':
            continue
        source = urllib.parse.quote('/' + bucket + '/' + key, safe='/')
        status, body = _call('PUT', key, headers={
            'x-amz-copy-source': source,
            'x-amz-metadata-directive': 'REPLACE',
            'content-type': mime,
        })
        if status != 200:
            raise RuntimeError(f'{key} {status} {body[:200]!r}')
        changed += 1
    return changed
