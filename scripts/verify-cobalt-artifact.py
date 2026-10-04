#!/usr/bin/env python3
"""Validate runtime provenance before using its source commit for packaging."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def validate(metadata, run, repository):
    if (run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('path') != '.github/workflows/build-starterless-cobalt.yml'
            or run.get('head_repository', {}).get('full_name') != repository):
        raise ValueError('Expected a successful Cobalt build from this repository')
    values = {}
    for line in metadata.splitlines():
        key, separator, value = line.partition('=')
        if not separator or key in values:
            raise ValueError('Invalid or duplicate runtime metadata')
        values[key] = value
    if (values.get('repository') != repository
            or not re.fullmatch(r'[0-9a-f]{40}', values.get('source_sha', ''))
            or values['source_sha'] != run.get('head_sha')):
        raise ValueError('Runtime source SHA does not match its workflow run')
    if not re.fullmatch(r'[0-9a-f]{40}', values.get('cobalt_source_sha', '')):
        raise ValueError('Missing exact upstream Cobalt source SHA')
    for key in ('source_ref', 'cobalt_ref'):
        if not re.fullmatch(r'[A-Za-z0-9_.+/-]+', values.get(key, '')):
            raise ValueError('Invalid runtime reference: ' + key)
    if values.get('build_type') not in ('gold', 'devel') or values.get('starboard_api') != '13':
        raise ValueError('Unsupported runtime build configuration')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.tar\.xz', values.get('archive', '')):
        raise ValueError('Invalid runtime archive name')
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    values = validate(args.metadata.read_text(), json.loads(args.run.read_text()), args.repository)
    if args.archive.name != values['archive']:
        raise ValueError('Runtime archive name does not match metadata')
    checksum = Path(str(args.archive) + '.sha256').read_text().split()
    if len(checksum) != 2 or not re.fullmatch(r'[0-9a-f]{64}', checksum[0]):
        raise ValueError('Invalid runtime checksum file')
    if hashlib.sha256(args.archive.read_bytes()).hexdigest() != checksum[0]:
        raise ValueError('Runtime archive checksum mismatch')
    with args.output.open('a') as output:
        for key in ('source_ref', 'source_sha', 'cobalt_ref', 'cobalt_source_sha', 'build_type'):
            output.write(key + '=' + values[key] + '\n')
    print('Runtime checksum and exact workflow/source provenance verified.')


if __name__ == '__main__':
    main()
