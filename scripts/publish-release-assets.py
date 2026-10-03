#!/usr/bin/env python3
"""Attach checksum-verified packages from an immutable artifacts commit."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request


def gh_json(repo, endpoint):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/{endpoint}']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--artifacts-sha', required=True)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    repo = os.environ['GITHUB_REPOSITORY']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
        parser.error('Invalid repository')
    version = re.fullmatch(r'v(\d+\.\d+\.\d+)(?:-[A-Za-z0-9.-]+)?', args.tag)
    if not version or not re.fullmatch(r'[0-9a-f]{40}', args.artifacts_sha):
        parser.error('Use a release tag and full immutable artifact commit SHA')
    release = gh_json(repo, f'releases/tags/{args.tag}')
    target = gh_json(repo, f'git/ref/tags/{args.tag}')['object']
    for _ in range(4):
        if target['type'] == 'commit':
            break
        target = gh_json(repo, f'git/tags/{target["sha"]}')['object']
    if target['type'] != 'commit':
        raise ValueError('Release tag does not resolve to a commit')
    base = f'https://raw.githubusercontent.com/{repo}/{args.artifacts_sha}/'
    with tempfile.TemporaryDirectory(prefix='ytaf-release-') as folder:
        root = Path(folder)

        def download(name):
            with urllib.request.urlopen(base + name, timeout=60) as response:
                (root / name).write_bytes(response.read())

        download('SHA256SUMS')
        digests = {}
        for line in (root / 'SHA256SUMS').read_text().splitlines():
            match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9_.-]*)', line)
            if not match or match[2] in digests or match[2] == 'SHA256SUMS':
                raise ValueError('Invalid or duplicate checksum entry')
            digests[match[2]] = match[1]
        if not digests or len(digests) > 20:
            raise ValueError('Unexpected artifact count')
        for name, expected in digests.items():
            download(name)
            if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f'Checksum mismatch: {name}')
        for app_id in ('com.cobalt.youtube.adfree', 'youtube.leanback.v4'):
            name = f'{app_id}_{version[1]}_arm.ipk'
            record = json.loads((root / f'{app_id}-build.json').read_text())
            if (record['source_sha'] != target['sha'] or record['app_id'] != app_id
                    or record['release_tag'] != args.tag or record['ipk'] != name
                    or record['ipk_sha256'] != digests[name]):
                raise ValueError(f'Package build record does not match release: {name}')
        print('Verified both package identities, source tag and all checksums.', flush=True)
        if args.verify_only:
            return
        digests['SHA256SUMS'] = hashlib.sha256((root / 'SHA256SUMS').read_bytes()).hexdigest()
        existing = {a['name']: a for a in release['assets']}
        pending = []
        for name, digest in digests.items():
            asset = existing.get(name)
            if asset:
                if asset.get('digest'):
                    if asset['digest'] != 'sha256:' + digest:
                        raise ValueError(f'Existing release asset differs: {name}')
                else:
                    prior = root / 'existing'
                    prior.mkdir(exist_ok=True)
                    subprocess.run(['gh', 'release', 'download', args.tag, '--repo', repo,
                                    '--pattern', name, '--dir', str(prior)], check=True)
                    if hashlib.sha256((prior / name).read_bytes()).hexdigest() != digest:
                        raise ValueError(f'Existing release asset differs: {name}')
                print(f'Already attached and verified: {name}', flush=True)
            else:
                pending.append(str(root / name))
        if pending:
            subprocess.run(['gh', 'release', 'upload', args.tag, '--repo', repo, *pending], check=True)
        after = {a['name']: a for a in gh_json(repo, f'releases/{release["id"]}/assets')}
        for name in digests:
            if name not in after or after[name]['state'] != 'uploaded':
                raise ValueError(f'Asset was not uploaded: {name}')
        print('All verified artifacts are attached to the release.', flush=True)


if __name__ == '__main__':
    main()
