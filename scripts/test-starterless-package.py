#!/usr/bin/env python3
"""Fail-closed native runtime dependency checks at the real package entrypoint."""
import os
import json
from pathlib import Path
import subprocess
import sys
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


    def test_local_fonts_are_required_and_overlaid_into_the_package(self):
        with tempfile.TemporaryDirectory(prefix='ytaf-font-package-') as temporary:
            root = Path(temporary)
            build, runtime, commands, assets = (root / name for name in ('build', 'runtime', 'bin', 'assets'))
            for path in (build / 'content/web/adblock/fonts', runtime, commands, assets / 'fonts'):
                path.mkdir(parents=True)
            (build / 'content/web/adblock/fonts/obsolete.woff2').write_bytes(b'old font')
            (build / 'cobalt').write_text('/web/adblock/adblockPreload.js\0com.cobalt.youtube.adfree')
            (build / 'cobalt').chmod(0o755)
            for name in ('libstdc++.so.6', 'libgcc_s.so.1'):
                (runtime / name).touch()
            for name, data in [('adblockMain.js', b'__shorts'), ('adblockMain.css', b'fonts/Inter-Regular.woff2'),
                               ('adblockPreload.js', b'__ytafPreloadExecuted'), ('fonts/Inter-Regular.woff2', b'regular-font')]:
                (assets / name).write_bytes(data)
            (commands / 'readelf').write_text('#!/bin/sh\nexit 0\n')
            # Inspect the final staging tree at the actual ares-package boundary.
            (commands / 'ares-package').write_text('#!' + sys.executable + '\n' +
                'import json,os,sys\nfrom pathlib import Path\n' +
                'fonts=Path(sys.argv[-1])/"content/web/adblock/fonts"\n' +
                'Path(os.environ["YTAF_STAGE_REPORT"]).write_text(json.dumps({p.name:p.read_text() for p in fonts.iterdir()}))\n' +
                'sys.exit(91)\n')
            for command in commands.iterdir(): command.chmod(0o755)
            report = root / 'staged-fonts.json'
            env = dict(os.environ, YTAF_PACKAGE_ID='com.cobalt.youtube.adfree',
                       PATH=str(commands) + os.pathsep + os.environ['PATH'],
                       COBALT_BUILD_DIR=str(build), COBALT_RUNTIME_DIR=str(runtime),
                       COBALT_PACKAGE_OUTPUT_DIR=str(root / 'out'), WEBAPP_OUTPUT_DIR=str(assets),
                       YTAF_STAGE_REPORT=str(report))
            command = ['bash', str(ROOT / 'scripts/package-starterless-cobalt.sh')]
            missing = subprocess.run(command, env=env, text=True, capture_output=True)
            self.assertEqual(missing.returncode, 6, missing.stdout + missing.stderr)
            self.assertIn('fonts/Inter-SemiBold.woff2', missing.stderr)
            self.assertFalse(report.exists())
            (assets / 'fonts/Inter-SemiBold.woff2').write_bytes(b'semibold-font')
            packaged = subprocess.run(command, env=env, text=True, capture_output=True)
            self.assertEqual(packaged.returncode, 91, packaged.stdout + packaged.stderr)
            self.assertEqual(json.loads(report.read_text()), {
                'Inter-Regular.woff2': 'regular-font', 'Inter-SemiBold.woff2': 'semibold-font'})

    def test_font_sources_preserve_preload_patch_and_upgrade_existing_gn_target(self):
        with tempfile.TemporaryDirectory(prefix='ytaf-font-install-') as temporary:
            root = Path(temporary)
            cobalt, assets = root / 'cobalt', root / 'assets'
            cobalt.mkdir(); (assets / 'fonts').mkdir(parents=True)
            subprocess.run(['git', 'init', '-q', str(cobalt)], check=True)
            content = cobalt / 'cobalt/adblock/content/BUILD.gn'
            # Apply the actual base content patch, then the actual preload hunk.
            for patch in ('cobalt-patches/cobalt-23.lts.6.patch', 'cobalt-platform/cobalt-23.lts.6-ytaf-preload.patch'):
                subprocess.run(['git', '-C', str(cobalt), 'apply', '--recount',
                                '--include=cobalt/adblock/content/BUILD.gn', str(ROOT / patch)], check=True)
            for font in ('Inter-Regular.woff2', 'Inter-SemiBold.woff2'):
                self.assertEqual(content.read_text().count('"fonts/' + font + '"'), 1)
                (assets / 'fonts' / font).write_bytes(font.encode())
            for asset in ('adblockMain.js', 'adblockMain.css', 'adblockPreload.js'):
                (assets / asset).write_text(asset)
            (cobalt / 'cobalt/adblock/BUILD.gn').write_text('// base integration fixture\n')
            browser = cobalt / 'cobalt/browser'; browser.mkdir()
            (browser / 'web_module.cc').write_text('void ReadYtafPreloadScript();\n')
            csp = cobalt / 'cobalt/csp'; csp.mkdir()
            patch = (ROOT / 'cobalt-platform/cobalt-23.lts.6-ytaf-dearrow-csp.patch').read_text()
            before = ''.join(line[1:] + '\n' for line in patch.splitlines()[3:] if line.startswith((' ', '-')))
            (csp / 'directive_list.cc').write_text('// fixture\n' * 905 + before + '// end\n')
            env = dict(os.environ, WEBAPP_OUTPUT_DIR=str(assets))
            command = ['bash', str(ROOT / 'scripts/install-ytaf-cobalt-assets.sh'), str(cobalt)]
            fresh = subprocess.run(command, env=env, text=True, capture_output=True)
            self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
            # Simulate an older, already-patched checkout that has no font sources.
            source = content.read_text()
            start = source.index('  sources += [')
            end = source.index('  ]', start) + len('  ]\n\n')
            content.write_text(source[:start] + source[end:])
            for _ in range(2):
                installed = subprocess.run(command, env=env, text=True, capture_output=True)
                self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
                for font in ('Inter-Regular.woff2', 'Inter-SemiBold.woff2'):
                    self.assertEqual(content.read_text().count('"fonts/' + font + '"'), 1)
                    self.assertEqual((content.parent / 'fonts' / font).read_bytes(), font.encode())

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
