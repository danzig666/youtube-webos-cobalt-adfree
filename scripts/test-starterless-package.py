#!/usr/bin/env python3
"""Fail-closed native runtime dependency checks at the real package entrypoint."""
import os
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class StarterlessPackageTests(unittest.TestCase):
    def check_rejected(self, readelf_body, message, code=4, binary_id="",
                       package_id="com.cobalt.youtube.adfree"):
        with tempfile.TemporaryDirectory(prefix='ytaf-package-') as temporary:
            root = Path(temporary)
            build, runtime, commands = (root / name for name in ('build', 'runtime', 'bin'))
            for path in (build / 'content', runtime, commands):
                path.mkdir(parents=True)
            cobalt = build / 'cobalt'
            cobalt.write_text('/web/adblock/adblockPreload.js\0' + binary_id)
            cobalt.chmod(0o755)
            for name in ('libstdc++.so.6', 'libgcc_s.so.1'):
                (runtime / name).touch()
            for name, body in (('ares-package', 'exit 99\n'), ('readelf', readelf_body)):
                command = commands / name
                command.write_text('#!/bin/sh\n' + body)
                command.chmod(0o755)
            env = dict(os.environ, YTAF_PACKAGE_ID=package_id, PATH=str(commands) + os.pathsep + os.environ['PATH'],
                       COBALT_BUILD_DIR=str(build), COBALT_RUNTIME_DIR=str(runtime),
                       COBALT_PACKAGE_OUTPUT_DIR=str(root / 'out'), WEBAPP_OUTPUT_DIR=str(root / 'no-assets'))
            result = subprocess.run(['bash', str(ROOT / 'scripts/package-starterless-cobalt.sh')],
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, code, result.stdout + result.stderr)
            self.assertIn(message, result.stderr)
            self.assertFalse((root / 'out').exists())

    def test_release_identities_and_invalid_override(self):
        renderer = str(ROOT / 'scripts/starterless-appinfo.py')
        for app_id, title in (
                ('youtube.leanback.v4', 'YouTube AdFree (Original ID)'),
                ('com.cobalt.youtube.adfree', 'YouTube Cobalt AdFree')):
            result = subprocess.run(['python3', renderer],
                                    env=dict(os.environ, YTAF_PACKAGE_ID=app_id),
                                    text=True, capture_output=True, check=True)
            info = json.loads(result.stdout)
            self.assertEqual(info['id'], app_id)
            self.assertEqual(info['title'], title)
            self.assertEqual(info['version'], json.loads(
                (ROOT / 'starterless-cobalt/appinfo.json').read_text())['version'])
        for invalid in ('', 'wrong.app', 'youtube.leanback.v4"'):
            result = subprocess.run(['bash', str(ROOT / 'scripts/package-starterless-cobalt.sh')],
                                    env=dict(os.environ, YTAF_PACKAGE_ID=invalid),
                                    text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('YTAF_PACKAGE_ID must be', result.stderr)

    def test_runtime_for_other_identity_is_rejected(self):
        ids = ('com.cobalt.youtube.adfree', 'youtube.leanback.v4')
        for package_id, binary_id in (ids, ids[::-1]):
            self.check_rejected('exit 0\n', 'Native runtime does not contain package identity',
                                code=5, binary_id=binary_id, package_id=package_id)

    def test_unreadable_elf_is_not_packaged(self):
        self.check_rejected('exit 1\n', 'Cannot inspect native runtime dependencies')

    def test_required_atomic_is_detected_without_a_pipefail_race(self):
        self.check_rejected("printf '[libatomic.so.1]\\n'\nhead -c 200000 /dev/zero | tr '\\000' x\n",
                            'Missing ARM runtime library:')


if __name__ == '__main__':
    unittest.main()
