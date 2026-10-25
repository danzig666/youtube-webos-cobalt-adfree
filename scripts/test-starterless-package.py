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
    def test_voice_runtime_requires_json_c_notice(self):
        self.check_rejected('exit 0\n', 'Missing voice JSON-C license',
                            binary_id='Magic Remote microphone:')

    def test_gold_workflow_scopes_artifact_assets_to_each_package(self):
        import textwrap
        workflow = (ROOT / '.github/workflows/build-starterless-cobalt.yml').read_text()
        step = workflow.split('      - name: Validate Gold IPK (artifact only)\n', 1)[1].split('\n      - name:', 1)[0]
        script = textwrap.dedent(step.split('        run: |\n', 1)[1])
        with tempfile.TemporaryDirectory(prefix='ytaf-gold-sequence-') as temporary:
            root = Path(temporary)
            (root / 'output').mkdir()
            version = json.loads((ROOT / 'starterless-cobalt/appinfo.json').read_text())['version']
            # Execute the real workflow shell; replace only external tool and
            # native compilation boundaries. Record the environment each sees.
            harness = r'''
npm() { :; }
docker() { :; }
python3() { :; }
sha256sum() { :; }
jq() { printf '%s\n' "$EXPECTED_VERSION"; }
bash() {
  printf '%s|%s|%s\n' "$1" "${YTAF_PACKAGE_ID-com.cobalt.youtube.adfree}" "${WEBAPP_OUTPUT_DIR-unset}" >> "$CALL_LOG"
  if [[ "$1" == scripts/package-starterless-cobalt.sh ]]; then
    : > "output/${YTAF_PACKAGE_ID-com.cobalt.youtube.adfree}_${EXPECTED_VERSION}_arm.ipk"
    printf 'fixture' > "output/${YTAF_PACKAGE_ID-com.cobalt.youtube.adfree}_${EXPECTED_VERSION}_arm.ipk"
  fi
}
'''
            env = dict(os.environ, GITHUB_WORKSPACE=str(root), COBALT_SOURCE_DIR=str(root / 'cobalt'),
                       COBALT_BUILD_TYPE='gold', WEBOS_LINUX_SDK_VOLUME='fixture-sdk',
                       EXPECTED_VERSION=version, CALL_LOG=str(root / 'calls'))
            env.pop('WEBAPP_OUTPUT_DIR', None)
            env.pop('YTAF_PACKAGE_ID', None)
            result = subprocess.run(['bash', '-c', harness + script], env=env, cwd=root,
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            assets = str(root / 'cobalt/out/webos-arm-sbversion-13_gold/content/web/adblock')
            self.assertEqual((root / 'calls').read_text().splitlines(), [
                'scripts/package-starterless-cobalt.sh|com.cobalt.youtube.adfree|' + assets,
                'scripts/build-starterless-cobalt-docker.sh|youtube.leanback.v4|unset',
                'scripts/package-starterless-cobalt.sh|youtube.leanback.v4|' + assets])

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
            bundled = build / 'content/fonts'; bundled.mkdir()
            (bundled / 'fonts.xml').write_text('<familyset><family><font>fallback.ttf</font></family></familyset>')
            (bundled / 'fallback.ttf').write_bytes(b'bundled-fallback')
            (build / 'cobalt').write_text('/web/adblock/adblockPreload.js\0com.cobalt.youtube.adfree\0$ORIGIN/lib/libfdk-aac.so')
            (build / 'cobalt').chmod(0o755)
            (build / 'lib').mkdir()
            (build / 'lib/libfdk-aac.so').write_text('private ARM AAC library')
            (build / 'lib/fdk-aac-build.txt').write_text('pinned AAC source')
            (build / 'content/licenses').mkdir()
            (build / 'content/licenses/fdk-aac.txt').write_text('AAC license notice')
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
                'stage=Path(sys.argv[-1])\n' +
                'Path(os.environ["YTAF_STAGE_REPORT"]).write_text(json.dumps({"custom":{p.name:p.read_text() for p in fonts.iterdir()},"system":(stage/"content/system_fonts/fonts.xml").read_text(),"bundled":(stage/"content/fonts/fallback.ttf").read_text(),"aac":(stage/"lib/libfdk-aac.so").read_text(),"aac_notice":(stage/"content/licenses/fdk-aac.txt").read_text(),"aac_source":(stage/"lib/fdk-aac-build.txt").read_text()}))\n' +
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
            staged = json.loads(report.read_text())
            self.assertEqual(staged['system'], (ROOT / 'cobalt-platform/webos/system_fonts/fonts.xml').read_text())
            self.assertEqual(staged['bundled'], 'bundled-fallback')
            self.assertEqual(staged['aac'], 'private ARM AAC library')
            self.assertEqual(staged['aac_notice'], 'AAC license notice')
            self.assertEqual(staged['aac_source'], 'pinned AAC source')
            firmware_env=dict(env,YTAF_PACKAGE_FDK_AAC='0')
            rejected=subprocess.run(command,env=firmware_env,text=True,capture_output=True)
            self.assertEqual(rejected.returncode,4)
            self.assertIn('safe missing-FDK handling',rejected.stderr)
            with (build/'cobalt').open('a') as f:
                f.write('\0Firmware AAC unavailable and no FDK fallback is installed')
            original=(commands/'ares-package').read_text()
            # Exercise the real staging path with fallback omission; an old
            # artifact can still carry the library and must not leak it into IPK.
            (commands/'ares-package').write_text(original.replace("(stage/\"lib/libfdk-aac.so\").read_text()", "str((stage/\"lib/libfdk-aac.so\").exists())").replace("(stage/\"content/licenses/fdk-aac.txt\").read_text()", "str((stage/\"content/licenses/fdk-aac.txt\").exists())").replace("(stage/\"lib/fdk-aac-build.txt\").read_text()", "str((stage/\"lib/fdk-aac-build.txt\").exists())"))
            firmware=subprocess.run(command,env=firmware_env,text=True,capture_output=True)
            self.assertEqual(firmware.returncode,91,firmware.stdout+firmware.stderr)
            only=json.loads(report.read_text())
            self.assertEqual((only['aac'],only['aac_notice'],only['aac_source']),('False','True','False'))
            self.assertEqual(staged['custom'], {
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
            (cobalt / 'cobalt/adblock/BUILD.gn').write_text('static_library("adblock") { deps = ["//cobalt/adblock/content:copy_adblock_web_files"] }\n')
            browser = cobalt / 'cobalt/browser'; browser.mkdir()
            (browser / 'web_module.cc').write_text('void ReadYtafPreloadScript();\n')
            csp = cobalt / 'cobalt/csp'; csp.mkdir()
            patch = (ROOT / 'cobalt-platform/cobalt-23.lts.6-ytaf-dearrow-csp.patch').read_text()
            before = ''.join(line[1:] + '\n' for line in patch.splitlines()[3:] if line.startswith((' ', '-')))
            (csp / 'directive_list.cc').write_text('// fixture\n' * 905 + before + '// end\n')
            # Recreate pre-upgrade native files from the actual logging patch.
            import re
            quiet = (ROOT / 'cobalt-platform/cobalt-23.lts.6-ytaf-quiet-script-logging.patch').read_text()
            for diff in quiet.split('diff --git ')[1:]:
                name = diff.splitlines()[0].split()[0][2:]
                lines = []
                for hunk in re.split(r'(?m)^@@ ', diff)[1:]:
                    header, body = hunk.split('\n', 1)
                    position = int(re.match(r'-(\d+)', header).group(1)) - 1
                    lines.extend(['\n'] * max(0, position - len(lines)))
                    lines.extend(line[1:] + '\n' for line in body.splitlines()
                                 if line.startswith((' ', '-')))
                path = cobalt / name; path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(''.join(lines))
            env = dict(os.environ, WEBAPP_OUTPUT_DIR=str(assets))
            command = ['bash', str(ROOT / 'scripts/install-ytaf-cobalt-assets.sh'), str(cobalt)]
            fresh = subprocess.run(command, env=env, text=True, capture_output=True)
            self.assertEqual(fresh.returncode, 0, fresh.stdout + fresh.stderr)
            self.assertEqual((cobalt / 'cobalt/adblock/system_fonts/fonts.xml').read_bytes(),
                             (ROOT / 'cobalt-platform/webos/system_fonts/fonts.xml').read_bytes())
            subprocess.run(['git', '-C', str(cobalt), 'apply', '--reverse', '--check',
                            str(ROOT / 'cobalt-platform/cobalt-23.lts.6-ytaf-quiet-script-logging.patch')], check=True)
            # Simulate an older, already-patched checkout that has no font sources.
            source = content.read_text()
            start = source.index('  sources += [')
            end = source.index('  ]', start) + len('  ]\n\n')
            content.write_text(source[:start] + source[end:])
            for _ in range(2):
                installed = subprocess.run(command, env=env, text=True, capture_output=True)
                self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
                self.assertEqual((cobalt / 'cobalt/adblock/BUILD.gn').read_text().count(
                    '"//cobalt/adblock/system_fonts:copy_webos_system_fonts"'), 1)
                for font in ('Inter-Regular.woff2', 'Inter-SemiBold.woff2'):
                    self.assertEqual(content.read_text().count('"fonts/' + font + '"'), 1)
                    self.assertEqual((content.parent / 'fonts' / font).read_bytes(), font.encode())

    def test_release_identities_and_invalid_override(self):
        renderer = str(ROOT / 'scripts/starterless-appinfo.py')
        installer = (ROOT / 'scripts/install-webos-starboard-platform.sh').read_text()
        metadata = installer.split("<<'PYMETA'\n", 1)[1].split('\nPYMETA', 1)[0]
        source_sha = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
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
            # Execute the actual generator used before Cobalt compilation.
            # Both identities must be native builds of the same source/version.
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'webos_build_metadata.h'
                command = ['python3', '-', str(ROOT), str(target)]
                env = dict(os.environ, YTAF_PACKAGE_ID=app_id)
                subprocess.run(command, input=metadata, text=True, env=env, check=True)
                header = target.read_text()
                self.assertIn('#define YTAF_APP_ID "' + app_id + '"', header)
                self.assertIn('#define YTAF_APP_VERSION "' + info['version'] + '"', header)
                self.assertIn('#define YTAF_SOURCE_SHA "' + source_sha + '"', header)
                mtime = target.stat().st_mtime_ns
                subprocess.run(command, input=metadata, text=True, env=env, check=True)
                self.assertEqual(target.stat().st_mtime_ns, mtime)
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

    def test_new_runtime_cannot_be_packaged_without_its_aac_dependency(self):
        self.check_rejected('exit 0\n', 'Missing bundled AAC runtime asset:',
                            binary_id='$ORIGIN/lib/libfdk-aac.so')

    def test_firmware_probe_runtime_requires_its_header_license(self):
        self.check_rejected('exit 0\n', 'Missing firmware FFmpeg probe header license.',
                            binary_id='--ytaf-ffmpeg-aac-probe')


if __name__ == '__main__':
    unittest.main()
