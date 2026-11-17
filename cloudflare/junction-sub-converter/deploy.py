#!/usr/bin/env python3
"""Standard-library-only Cloudflare multi-module uploader; never stores credentials."""
import argparse
from email import policy
from email.parser import BytesParser
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
ACCOUNT = 'bfbb6ae1d75dad31266c7327e2401e01'
SCRIPT = 'junction-sub-converter-v2'
API_ROOT = 'https://api.cloudflare.com/client/v4'
SCRIPT_PATH = f'/accounts/{ACCOUNT}/workers/scripts/{SCRIPT}'
SECRET_NAMES = ('WARP_PROFILES', 'TS_AUTH_KEY', 'TS_CONTROL_URL', 'EXTRA_NODES', 'ACCESS_KEY', 'WARP_ACCESS_KEY')
REQUIRED = ('WARP_PROFILES', 'TS_AUTH_KEY', 'TS_CONTROL_URL', 'EXTRA_NODES')


def load_token(path=Path('/opt/data/.env')):
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith('export '):
            line = line[7:]
        key, sep, value = line.partition('=')
        if sep and key.strip() == 'CLOUDFLARE_WORKERS_TOKEN':
            value = value.strip().strip('"').strip("'")
            if value:
                return value
    raise ValueError('CLOUDFLARE_WORKERS_TOKEN is missing from /opt/data/.env')


def load_secrets():
    path = Path(os.environ.get('SECRETS_FILE', '/opt/data/.secrets/junction-secrets.json'))
    raw = json.loads(path.read_text())
    if any(not isinstance(raw.get(name), str) or not raw[name] for name in REQUIRED):
        raise ValueError('Secret fixture is missing required nonempty string bindings')
    return {name: raw[name] for name in SECRET_NAMES if isinstance(raw.get(name), str) and raw[name]}


def modules():
    found = {path.relative_to(ROOT).as_posix(): path.read_bytes() for path in sorted((ROOT / 'src').rglob('*.js'))}
    if 'src/index.js' not in found:
        raise ValueError('src/index.js is missing')
    return found


def multipart(source_modules, secrets):
    boundary = 'junction-' + uuid.uuid4().hex
    metadata = {
        'main_module': 'src/index.js', 'compatibility_date': '2024-01-01',
        'bindings': [{'type': 'secret_text', 'name': name, 'text': value} for name, value in secrets.items()],
    }
    parts = [('metadata', None, 'application/json', json.dumps(metadata).encode())]
    parts.extend((name, name, 'application/javascript+module', data) for name, data in source_modules.items())
    body = bytearray()
    for name, filename, content_type, data in parts:
        disposition = f'Content-Disposition: form-data; name="{name}"'
        if filename:
            disposition += f'; filename="{filename}"'
        body.extend(f'--{boundary}\r\n{disposition}\r\nContent-Type: {content_type}\r\n\r\n'.encode())
        body.extend(data)
        body.extend(b'\r\n')
    body.extend(f'--{boundary}--\r\n'.encode())
    return bytes(body), f'multipart/form-data; boundary={boundary}'


class API:
    def __init__(self, token):
        self.token = token

    def raw(self, method, path, body=None, content_type='application/json'):
        request = urllib.request.Request(API_ROOT + path, data=body, method=method, headers={
            'Authorization': 'Bearer ' + self.token, 'Content-Type': content_type,
        })
        try:
            with urllib.request.urlopen(request, timeout=60) as result:
                return result.read(), result.headers.get('Content-Type', '')
        except urllib.error.HTTPError as error:
            # The provider's full error body can contain submitted values: do not echo it.
            raise RuntimeError(f'Cloudflare HTTP {error.code}') from None
        except urllib.error.URLError:
            raise RuntimeError('Cloudflare network request failed') from None

    def json(self, method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        data, _ = self.raw(method, path, body)
        try:
            result = json.loads(data)
        except (ValueError, TypeError):
            raise RuntimeError('Invalid Cloudflare JSON response') from None
        if result.get('success') is not True:
            raise RuntimeError('Cloudflare API reported failure')
        return result.get('result')


def decode_modules(body, content_type):
    message = BytesParser(policy=policy.default).parsebytes(
        f'Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n'.encode() + body)
    if not message.is_multipart():
        raise RuntimeError('Readback did not return multipart module content')
    return {
        part.get_param('name', header='content-disposition') or part.get_filename(): part.get_payload(decode=True)
        for part in message.iter_parts()
    }


def verify_bindings(api, expected):
    bindings = api.json('GET', SCRIPT_PATH + '/secrets')
    actual = {item['name'] for item in bindings if item.get('type') == 'secret_text'}
    if not set(expected).issubset(actual):
        raise RuntimeError('Secret binding readback mismatch')
    # Secret values are intentionally unreadable through the Cloudflare API.


def upload(api, source_modules, secrets):
    body, content_type = multipart(source_modules, secrets)
    raw, _ = api.raw('PUT', SCRIPT_PATH, body, content_type)
    result = json.loads(raw)
    if result.get('success') is not True:
        raise RuntimeError('Cloudflare upload reported failure')
    remote_body, remote_type = api.raw('GET', SCRIPT_PATH + '/content/v2')
    remote = decode_modules(remote_body, remote_type)
    if any(remote.get(name) != data for name, data in source_modules.items()):
        raise RuntimeError('Uploaded module content readback mismatch')
    verify_bindings(api, secrets)
    print(f'PASS upload: {len(source_modules)} modules read back; secret binding names verified')


def push_secrets(api, secrets):
    for name, value in secrets.items():
        api.json('PUT', SCRIPT_PATH + '/secrets', {'name': name, 'type': 'secret_text', 'text': value})
    verify_bindings(api, secrets)
    print(f'PASS secrets: {len(secrets)} binding names verified (values are not readable)')


def create_route(api, zone_id, pattern):
    path = f'/zones/{urllib.parse.quote(zone_id, safe="")}/workers/routes'
    created = api.json('POST', path, {'pattern': pattern, 'script': SCRIPT})
    route_id = created.get('id')
    if not route_id:
        raise RuntimeError('Route creation did not return an identifier')
    actual = api.json('GET', path + '/' + urllib.parse.quote(route_id, safe=''))
    if actual.get('pattern') != pattern or actual.get('script') != SCRIPT:
        raise RuntimeError('Route readback mismatch')
    print('PASS route: pattern and script read back')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ('upload', 'secrets', 'route'):
        child = commands.add_parser(command)
        child.add_argument('--dry-run', action='store_true', help='Validate locally; never read token or call network')
        if command == 'route':
            child.add_argument('--zone-id')
            child.add_argument('--pattern')
            child.add_argument('--confirm-create-route', action='store_true')
    args = parser.parse_args(argv)
    if args.command == 'route':
        if not args.zone_id or not args.pattern:
            parser.error('route requires explicit --zone-id and --pattern; no default route is configured')
        if not args.dry_run and not args.confirm_create_route:
            parser.error('route requires --confirm-create-route; no route was created')
        if args.dry_run:
            print('PASS dry-run route: explicit parameters validated; no network calls')
            return 0
        create_route(API(load_token()), args.zone_id, args.pattern)
        return 0
    secrets = load_secrets()
    source_modules = modules() if args.command == 'upload' else {}
    if args.dry_run:
        if args.command == 'upload':
            body, content_type = multipart(source_modules, secrets)
            if decode_modules(body, content_type).get('src/index.js') != source_modules['src/index.js']:
                raise RuntimeError('Local multipart readback mismatch')
        print(f'PASS dry-run {args.command}: modules={len(source_modules)}, secret bindings={len(secrets)}; no network calls')
        return 0
    api = API(load_token())
    if args.command == 'upload':
        upload(api, source_modules, secrets)
    else:
        push_secrets(api, secrets)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, KeyError, TypeError):
        # No traceback or arbitrary payload, token, URL or secret data in CLI output.
        print('FAIL deployment operation; check local inputs, API permissions and connectivity (details suppressed)', file=sys.stderr)
        sys.exit(1)
