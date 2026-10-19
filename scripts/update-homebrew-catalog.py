#!/usr/bin/env python3
"""Generate a Homebrew feed from both verified, published release packages."""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
from urllib.parse import quote
from urllib.request import urlopen

APP_IDS = ('com.cobalt.youtube.adfree', 'youtube.leanback.v4')
TAG = re.compile(r'v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:-[A-Za-z0-9.-]+)?')
REPOSITORY = re.compile(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+')
spec = importlib.util.spec_from_file_location('ipk', Path(__file__).with_name('verify-ipk-container.py'))
ipk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipk)


def api(repository, path, payload=None, method='GET'):
    command = ['gh', 'api', f'repos/{repository}/{path}']
    if payload is not None:
        command += ['--method', method, '--input', '-']
    result = subprocess.run(command, input=None if payload is None else json.dumps(payload).encode(),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode().strip())
    return json.loads(result.stdout)


def find_release(repository, tag):
    try:
        return api(repository, 'releases/tags/' + quote(tag, safe=''))
    except RuntimeError as error:
        if 'HTTP 404' not in str(error):
            raise
    # Some GitHub release-by-tag responses omit unpublished drafts.
    for release in api(repository, 'releases?per_page=100'):
        if release.get('tag_name') == tag and release.get('draft'):
            return release
    raise ValueError('Release does not exist: ' + tag)


def tag_commit(repository, tag):
    target = api(repository, 'git/ref/tags/' + quote(tag, safe=''))['object']
    for _ in range(4):
        if target['type'] == 'commit':
            if re.fullmatch(r'[0-9a-f]{40}', target['sha']):
                return target['sha']
            break
        if target['type'] != 'tag':
            break
        target = api(repository, 'git/tags/' + target['sha'])['object']
    raise ValueError('Release tag does not resolve to an immutable commit')


def release_assets(release, repository):
    match = TAG.fullmatch(release.get('tag_name', ''))
    if not REPOSITORY.fullmatch(repository) or not match:
        raise ValueError('Invalid repository or release tag')
    if release.get('draft') is not False or not release.get('published_at'):
        raise ValueError('Only published releases can enter the Homebrew catalog')
    version = match[1]
    names = ['SHA256SUMS'] + [name for app in APP_IDS for name in
                              (f'{app}-build.json', f'{app}_{version}_arm.ipk')]
    assets = {}
    for asset in release.get('assets', []):
        name = asset.get('name')
        if name not in names:
            continue
        expected = f'https://github.com/{repository}/releases/download/{release["tag_name"]}/{name}'
        limit = 256 * 1024 * 1024 if name.endswith('.ipk') else 1024 * 1024
        if (name in assets or asset.get('state') != 'uploaded'
                or type(asset.get('size')) is not int or not 0 < asset['size'] <= limit
                or asset.get('browser_download_url') != expected):
            raise ValueError('Invalid or duplicate release asset: ' + name)
        digest = asset.get('digest')
        if digest is not None and not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
            raise ValueError('Invalid release asset digest: ' + name)
        assets[name] = asset
    if set(assets) != set(names):
        raise ValueError('Release needs both IPKs, both build records and SHA256SUMS')
    return version, assets


def download_assets(assets, directory):
    for name, asset in assets.items():
        path = directory / name
        total, digest = 0, hashlib.sha256()
        with urlopen(asset['browser_download_url'], timeout=60) as response, path.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > asset['size']:
                    raise ValueError('Release asset exceeds declared size: ' + name)
                digest.update(chunk)
                output.write(chunk)
        if total != asset['size'] or asset.get('digest') not in (None, 'sha256:' + digest.hexdigest()):
            raise ValueError('Release asset size or digest mismatch: ' + name)


def checksums(text):
    result = {}
    for line in text.splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9_.-]*)', line)
        if not match or match[2] in result or match[2] == 'SHA256SUMS':
            raise ValueError('Invalid or duplicate checksum entry')
        result[match[2]] = match[1]
    if not 1 <= len(result) <= 20:
        raise ValueError('Unexpected checksum entry count')
    return result


def tar_file(archive, name, limit):
    matches = [m for m in archive.getmembers() if m.name.removeprefix('./') == name]
    if len(matches) != 1 or not matches[0].isfile() or not 0 < matches[0].size <= limit:
        raise ValueError('Expected one regular package file: ' + name)
    return archive.extractfile(matches[0])


def inspect_package(path, app_id, version, record):
    members = ipk.read_members(path)
    if members['debian-binary'][1] != b'2.0\n':
        raise ValueError('Invalid IPK format version')
    ipk.verify_data_metadata(members['data.tar.gz'][1])
    with tarfile.open(fileobj=io.BytesIO(members['control.tar.gz'][1]), mode='r:gz') as archive:
        fields = {}
        for line in tar_file(archive, 'control', 65536).read().decode().splitlines():
            if not line or line[0].isspace():
                continue
            key, separator, value = line.partition(':')
            if not separator or key in fields:
                raise ValueError('Invalid or duplicate package control field')
            fields[key] = value.strip()
        if any(fields.get(key) != expected for key, expected in
               (('Package', app_id), ('Version', version), ('Architecture', 'arm'))):
            raise ValueError('Package control identity/version/architecture mismatch')
    with tarfile.open(fileobj=io.BytesIO(members['data.tar.gz'][1]), mode='r:gz') as archive:
        prefix = 'usr/palm/applications/'
        for member in archive.getmembers():
            name = member.name.removeprefix('./')
            if name.startswith(prefix) and name != prefix and name[len(prefix):].split('/')[0] != app_id:
                raise ValueError('Package contains another application identity')
        info = json.loads(tar_file(archive, prefix + app_id + '/appinfo.json', 65536).read())
        if (info.get('id') != app_id or info.get('version') != version or info.get('type') != 'native'
                or info.get('title') != record.get('launcher_title')):
            raise ValueError('Embedded appinfo identity/version/title mismatch')
        # Verify the actual native payload against its release build record.
        with tar_file(archive, prefix + app_id + '/cobalt', 256 * 1024 * 1024) as binary:
            header = binary.read(20)
            if header[:5] != b'\x7fELF\x01' or header[18:20] != b'\x28\x00':
                raise ValueError('Expected a 32-bit ARM Cobalt runtime')
            digest, tail = hashlib.sha256(header), header
            other = next(value for value in APP_IDS if value != app_id)
            needles = [record['source_sha'].encode(), app_id.encode(), other.encode()]
            found = [False, False, False]
            overlap = max(map(len, needles))
            while chunk := binary.read(1024 * 1024):
                digest.update(chunk)
                found = [seen or needle in tail + chunk for seen, needle in zip(found, needles)]
                tail = chunk[-overlap:]
            if digest.hexdigest() != record.get('binary_sha256') or found != [True, True, False]:
                raise ValueError('Native runtime digest/source/application identity mismatch')
    return info


def generate_catalog(release, directory, repository, source):
    version, assets = release_assets(release, repository)
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Expected the exact release source commit')
    # Compare downloaded bytes with GitHub metadata even for offline generation.
    digests = {}
    for name, asset in assets.items():
        path = directory / name
        digests[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.stat().st_size != asset['size'] or asset.get('digest') not in (None, 'sha256:' + digests[name]):
            raise ValueError('Release asset size or digest mismatch: ' + name)
    expected = checksums((directory / 'SHA256SUMS').read_text())
    for name in assets:
        if name != 'SHA256SUMS' and expected.get(name) != digests[name]:
            raise ValueError('Release checksum mismatch: ' + name)
    packages = []
    icon = f'https://raw.githubusercontent.com/{repository}/main/assets/largeIcon.png'
    for app_id in APP_IDS:
        name = f'{app_id}_{version}_arm.ipk'
        record = json.loads((directory / f'{app_id}-build.json').read_text())
        if any(record.get(key) != value for key, value in {
            'source_sha': source, 'app_id': app_id, 'package_version': version,
            'release_tag': release['tag_name'], 'ipk': name, 'ipk_sha256': digests[name]
        }.items()):
            raise ValueError('Build record does not match release: ' + app_id)
        info = inspect_package(directory / name, app_id, version, record)
        separate = app_id == APP_IDS[0]
        packages.append({
            'id': app_id,
            'title': info['title'] + (' (Separate ID)' if separate else ''),
            'shortDescription': ('Installs alongside official YouTube.' if separate else 'Replaces official YouTube.')
                                + ' Ad blocking, SponsorBlock and remote playback controls.',
            'iconUri': icon,
            'manifest': {
                'id': app_id, 'version': version, 'type': 'native', 'title': info['title'],
                'iconUri': icon, 'sourceUrl': f'https://github.com/{repository}',
                'rootRequired': False, 'ipkUrl': assets[name]['browser_download_url'],
                'ipkHash': {'sha256': digests[name]}, 'ipkSize': assets[name]['size']
            }
        })
    return {'packages': packages}


def validate_update(current, candidate):
    if not isinstance(current, dict) or not isinstance(current.get('packages'), list):
        raise ValueError('Invalid existing Homebrew catalog')
    incoming = {p['id']: p['manifest'] for p in candidate['packages']}
    if set(incoming) != set(APP_IDS) or len(candidate['packages']) != 2:
        raise ValueError('Catalog must update both real package identities together')
    seen = set()
    for package in current['packages']:
        app_id, old = package.get('id'), package.get('manifest', {})
        if app_id not in APP_IDS or app_id in seen or old.get('id') != app_id:
            raise ValueError('Unexpected or duplicate existing catalog identity')
        seen.add(app_id)
        prior = old.get('version', '')
        if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', prior):
            raise ValueError('Invalid existing catalog version')
        new = incoming[app_id]
        if tuple(map(int, new['version'].split('.'))) < tuple(map(int, prior.split('.'))):
            raise ValueError('Refusing to downgrade the Homebrew catalog')
        if new['version'] == prior and (new['ipkHash'] != old.get('ipkHash') or new['ipkSize'] != old.get('ipkSize')):
            raise ValueError('Different package bytes need a new app version')


def catalog_text(catalog):
    return json.dumps(catalog, indent=2, ensure_ascii=False) + '\n'


def publish_catalog(repository, catalog, tag):
    # A single Contents API update publishes both identities atomically. A stale
    # blob SHA causes a retry and another downgrade check, never a forced write.
    endpoint = 'contents/repo.json'
    for attempt in range(3):
        existing = api(repository, endpoint + '?ref=main')
        current = json.loads(base64.b64decode(existing['content']))
        validate_update(current, catalog)
        if current == catalog:
            print('Homebrew catalog is already current.')
            return
        try:
            api(repository, endpoint, {
                'message': f'catalog: publish verified {tag} packages', 'branch': 'main',
                'sha': existing['sha'], 'content': base64.b64encode(catalog_text(catalog).encode()).decode()
            }, method='PUT')
        except RuntimeError as error:
            if attempt < 2 and any(code in str(error) for code in ('HTTP 409', 'HTTP 422')):
                continue
            raise
        after = api(repository, endpoint + '?ref=main')
        if json.loads(base64.b64decode(after['content'])) != catalog:
            raise ValueError('Published catalog changed during verification; rerun the workflow')
        print('Published both verified packages to main/repo.json.')
        return


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY'))
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--publish', action='store_true', help='Update main/repo.json after full validation')
    parser.add_argument('--skip-draft', action='store_true', help='Wait for the release-published event when assets belong to a draft')
    args = parser.parse_args()
    if not args.repository or not REPOSITORY.fullmatch(args.repository) or not TAG.fullmatch(args.tag):
        parser.error('Use owner/repository and a vMAJOR.MINOR.PATCH release tag')
    release = find_release(args.repository, args.tag)
    if args.skip_draft and release.get('draft') is True:
        print('Release is a draft; Homebrew will update after publication.')
        return
    _, assets = release_assets(release, args.repository)
    source = tag_commit(args.repository, args.tag)
    with tempfile.TemporaryDirectory(prefix='ytaf-catalog-') as temporary:
        directory = Path(temporary)
        download_assets(assets, directory)
        catalog = generate_catalog(release, directory, args.repository, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=args.output.parent, delete=False, encoding='utf-8') as output:
        temporary = Path(output.name)
        output.write(catalog_text(catalog))
    os.replace(temporary, args.output)
    print('Verified both published IPKs and generated:', args.output)
    if args.publish:
        publish_catalog(args.repository, catalog, args.tag)


if __name__ == '__main__':
    main()
