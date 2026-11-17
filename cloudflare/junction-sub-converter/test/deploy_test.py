"""Offline deploy acceptance: no API credentials loaded and no network calls."""
import contextlib
from email import policy
from email.parser import BytesParser
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
from unittest import mock
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('junction_deploy', ROOT / 'deploy.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def check(ok, label):
    if not ok:
        raise RuntimeError(label)


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.body = None
        self.content_type = None
        self.bindings = []
        self.route = None

    def raw(self, method, path, body=None, content_type='application/json'):
        self.calls.append((method, path))
        if method == 'PUT' and path == deploy.SCRIPT_PATH:
            self.body, self.content_type = body, content_type
            parts = deploy.decode_modules(body, content_type)
            metadata = json.loads(parts['metadata'])
            self.bindings = metadata['bindings']
            return json.dumps({'success': True, 'result': {}}).encode(), 'application/json'
        if method == 'GET' and path == deploy.SCRIPT_PATH + '/content/v2':
            return self.body, self.content_type
        raise RuntimeError('Unexpected offline API path')

    def json(self, method, path, payload=None):
        self.calls.append((method, path))
        if path == deploy.SCRIPT_PATH + '/secrets':
            if method == 'PUT':
                check(payload['type'] == 'secret_text', 'Secret type must be explicit')
                self.bindings = [entry for entry in self.bindings if entry['name'] != payload['name']] + [payload]
                return {'name': payload['name'], 'type': 'secret_text'}
            if method == 'GET':
                return [{'name': entry['name'], 'type': entry['type']} for entry in self.bindings]
        if method == 'POST' and path.endswith('/workers/routes'):
            self.route = {**payload, 'id': uuid.uuid4().hex}
            return self.route
        if method == 'GET' and self.route and path.endswith('/' + self.route['id']):
            return self.route
        raise RuntimeError('Unexpected offline JSON API path')


def main():
    secrets = deploy.load_secrets()
    check(bool(secrets.get('ACCESS_KEY')), 'Fixture ACCESS_KEY missing')
    source = deploy.modules()
    check(len(source) > 10, 'Source module discovery is incomplete')
    body, content_type = deploy.multipart(source, secrets)
    parsed = BytesParser(policy=policy.default).parsebytes(f'Content-Type: {content_type}\r\n\r\n'.encode() + body)
    parts = list(parsed.iter_parts())
    check(len(parts) == len(source) + 1, 'Multipart part count mismatch')
    metadata = json.loads(parts[0].get_payload(decode=True))
    check(metadata['main_module'] == 'src/index.js' and metadata['compatibility_date'] == '2024-01-01', 'Worker metadata mismatch')
    check(all(binding['type'] == 'secret_text' for binding in metadata['bindings']), 'Non-secret binding detected')
    check({binding['name']: binding['text'] for binding in metadata['bindings']} == secrets, 'Secret binding payload mismatch')
    check(all(part.get_content_type() == 'application/javascript+module' for part in parts[1:]), 'ES module MIME mismatch')
    check(all(deploy.decode_modules(body, content_type)[name] == data for name, data in source.items()), 'Multipart module bytes changed')
    api = FakeAPI()
    with contextlib.redirect_stdout(io.StringIO()):
        deploy.upload(api, source, secrets)
        deploy.push_secrets(api, secrets)
        deploy.create_route(api, 'offline-zone', 'example.invalid/junction*')
    check(('GET', deploy.SCRIPT_PATH + '/content/v2') in api.calls, 'Upload did not read back module content')
    check(api.calls[-1][0] == 'GET', 'Route mutation was not verified')
    # Prove fail-closed route default without reading a token or touching network.
    with mock.patch.object(deploy, 'load_token', side_effect=RuntimeError('Token should not be read')), mock.patch.object(deploy.urllib.request, 'urlopen', side_effect=RuntimeError('Network forbidden')):
        for command in ('upload', 'secrets'):
            with contextlib.redirect_stdout(io.StringIO()):
                check(deploy.main([command, '--dry-run']) == 0, 'Dry run failed')
        with contextlib.redirect_stderr(io.StringIO()):
            try:
                deploy.main(['route'])
            except SystemExit as error:
                check(error.code == 2, 'Missing route parameters must fail')
            else:
                raise RuntimeError('Route unexpectedly created without explicit arguments')
    # Token parsing uses a runtime-generated value held only in memory.
    ephemeral = uuid.uuid4().hex
    with mock.patch.object(Path, 'read_text', return_value='export CLOUDFLARE_WORKERS_TOKEN="' + ephemeral + '"\n'):
        check(deploy.load_token() == ephemeral, 'Quoted dotenv token parser failed')
    print(f'离线部署脚本: PASS; modules={len(source)}, secret bindings={len(secrets)}; multipart/readback/route guard; zero Cloudflare calls')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('FAIL offline deployment tests (sensitive details suppressed)', file=sys.stderr)
        sys.exit(1)
