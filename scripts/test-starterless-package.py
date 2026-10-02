#!/usr/bin/env python3
"""Fail-closed native runtime dependency checks at the real package entrypoint."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class StarterlessPackageTests(unittest.TestCase):
    def check_rejected(self, readelf_body, message):
        with tempfile.TemporaryDirectory(prefix='ytaf-package-') as temporary:
            root = Path(temporary)
            build, runtime, commands = (root / name for name in ('build', 'runtime', 'bin'))
            for path in (build / 'content', runtime, commands):
                path.mkdir(parents=True)
            cobalt = build / 'cobalt'
            cobalt.write_text('/web/adblock/adblockPreload.js')
            cobalt.chmod(0o755)
            for name in ('libstdc++.so.6', 'libgcc_s.so.1'):
                (runtime / name).touch()
            for name, body in (('ares-package', 'exit 99\n'), ('readelf', readelf_body)):
                command = commands / name
                command.write_text('#!/bin/sh\n' + body)
                command.chmod(0o755)
            env = dict(os.environ, PATH=str(commands) + os.pathsep + os.environ['PATH'],
                       COBALT_BUILD_DIR=str(build), COBALT_RUNTIME_DIR=str(runtime),
                       COBALT_PACKAGE_OUTPUT_DIR=str(root / 'out'), WEBAPP_OUTPUT_DIR=str(root / 'no-assets'))
            result = subprocess.run(['bash', str(ROOT / 'scripts/package-starterless-cobalt.sh')],
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 4, result.stdout + result.stderr)
            self.assertIn(message, result.stderr)
            self.assertFalse((root / 'out').exists())

    def test_unreadable_elf_is_not_packaged(self):
        self.check_rejected('exit 1\n', 'Cannot inspect native runtime dependencies')

    def test_required_atomic_is_detected_without_a_pipefail_race(self):
        self.check_rejected("printf '[libatomic.so.1]\\n'\nhead -c 200000 /dev/zero | tr '\\000' x\n",
                            'Missing ARM runtime library:')


if __name__ == '__main__':
    unittest.main()
