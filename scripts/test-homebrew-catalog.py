#!/usr/bin/env python3
"""Offline regressions for real package identity and atomic Homebrew updates."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('catalog', SCRIPTS / 'update-homebrew-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
REPOSITORY, TAG, VERSION, SOURCE = 'owner/project', 'v2.6.29-beta.1', '2.6.29', 'a' * 40


def tar(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz', format=tarfile.USTAR_FORMAT) as archive:
        for name, data, mode in entries:
            member = tarfile.TarInfo(name)
            member.size, member.uid, member.gid, member.mode, member.mtime = len(data), 0, 5000, mode, 1700000000
            archive.addfile(member, io.BytesIO(data))
    return output.getvalue()


def package(app_id, changes):
    title = 'Separate' if app_id == catalog.APP_IDS[0] else 'Original ID'
    info = {'id': app_id, 'version': VERSION, 'type': 'native', 'title': title}
    info.update(changes.get('info', {}))
    binary = bytearray(20)
    binary[:5], binary[18:20] = b'\x7fELF\x01', b'\x28\x00'
    binary = changes.get('binary', bytes(binary) + SOURCE.encode() + app_id.encode())
    control = f'Package: {app_id}\nVersion: {VERSION}\nArchitecture: arm\n'
    control = changes.get('control', control).encode()
    root = 'usr/palm/applications/' + app_id + '/'
    entries = [(root + 'appinfo.json', json.dumps(info).encode(), 0o644),
               (root + 'cobalt', binary, 0o755)] + changes.get('extra', [])
    members = [('debian-binary', b'2.0\n'), ('control.tar.gz', tar([('control', control, 0o644)])), ('data.tar.gz', tar(entries))]
    result = b'!<arch>\n'
    for name, value in members:
        header = f'{name:<16}{1700000000:<12}{0:<6}{0:<6}{100644:<8}{len(value):<10}`\n'.encode()
        result += header + value + (b'\n' if len(value) % 2 else b'')
    return result, binary, title


def fixture(directory, changes=None):
    changes = changes or {}
    paths = []
    for app_id in catalog.APP_IDS:
        options = changes.get(app_id, {})
        data, binary, title = package(app_id, options)
        name = f'{app_id}_{VERSION}_arm.ipk'
        path = directory / name
        path.write_bytes(data)
        record = {'source_sha': SOURCE, 'app_id': app_id, 'package_version': VERSION,
                  'release_tag': TAG, 'ipk': name, 'ipk_sha256': hashlib.sha256(data).hexdigest(),
                  'binary_sha256': hashlib.sha256(binary).hexdigest(), 'launcher_title': title}
        record.update(options.get('record', {}))
        record_path = directory / f'{app_id}-build.json'
        record_path.write_text(json.dumps(record))
        paths.extend([path, record_path])
    (directory / 'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in paths))
    paths.append(directory / 'SHA256SUMS')
    return {'tag_name': TAG, 'draft': False, 'published_at': '2026-10-16T21:40:00Z', 'prerelease': True,
            'assets': [{'name': p.name, 'state': 'uploaded', 'size': p.stat().st_size,
                        'digest': 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest(),
                        'browser_download_url': f'https://github.com/{REPOSITORY}/releases/download/{TAG}/{p.name}'} for p in paths]}


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.release = fixture(self.root)

    def generate(self, release=None):
        return catalog.generate_catalog(release or self.release, self.root, REPOSITORY, SOURCE)

    def test_both_real_ids_exact_versions_and_bytes_with_clear_replacement_labels(self):
        result = self.generate()
        self.assertEqual([p['id'] for p in result['packages']], list(catalog.APP_IDS))
        for package in result['packages']:
            manifest = package['manifest']
            self.assertEqual(package['id'], manifest['id'])
            self.assertEqual(manifest['version'], VERSION)  # not the beta tag suffix
            self.assertFalse(manifest['rootRequired'])
            path = self.root / f'{package["id"]}_{VERSION}_arm.ipk'
            self.assertEqual(manifest['ipkSize'], path.stat().st_size)
            self.assertEqual(manifest['ipkHash']['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertIn(REPOSITORY, manifest['ipkUrl'])
        self.assertIn('alongside', result['packages'][0]['shortDescription'])
        self.assertIn('Replaces official', result['packages'][1]['shortDescription'])
        self.assertEqual(catalog.catalog_text(result), catalog.catalog_text(self.generate()))

    def test_missing_one_asset_draft_or_unpublished_release_is_rejected(self):
        for release in (dict(self.release, draft=True), dict(self.release, published_at=None),
                        dict(self.release, assets=self.release['assets'][:-1])):
            with self.subTest(release=release), self.assertRaises(ValueError):
                self.generate(release)

    def test_wrong_origin_duplicate_pending_and_wrong_size_assets_are_rejected(self):
        for change in ({'browser_download_url':'https://github.com/someone/else/malicious.ipk'},
                       {'state':'new'}, {'size':True}, {'size':0}, {'digest':'bad'}):
            release = copy.deepcopy(self.release)
            release['assets'][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.generate(release)
        release = copy.deepcopy(self.release)
        release['assets'].append(release['assets'][0])
        with self.assertRaises(ValueError): self.generate(release)

    def test_tampered_package_bytes_fail_even_if_a_github_digest_is_unavailable(self):
        for asset in self.release['assets']: asset['digest'] = None
        path = self.root / self.release['assets'][0]['name']
        data = path.read_bytes(); path.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.generate()

    def test_checksum_manifest_rejects_duplicate_path_traversal_and_missing_entries(self):
        for text in ('a'*64+'  ../bad.ipk\n', 'a'*64+'  x\n'+'a'*64+'  x\n', '', 'bad  x\n'):
            with self.subTest(text=text), self.assertRaises(ValueError): catalog.checksums(text)

    def test_build_record_cannot_point_at_another_tag_source_identity_or_binary(self):
        for key, value in [('source_sha','b'*40),('app_id',catalog.APP_IDS[1]),('package_version','2.6.28'),
                           ('release_tag','v2.6.28-beta.1'),('binary_sha256','0'*64)]:
            self.release = fixture(self.root, {catalog.APP_IDS[0]:{'record':{key:value}}})
            with self.subTest(key=key), self.assertRaises(ValueError): self.generate()

    def test_resigned_packages_still_need_correct_embedded_appinfo(self):
        for info in ({'id':catalog.APP_IDS[1]}, {'version':'2.6.28'}, {'type':'web'}, {'title':'wrong'}):
            self.release = fixture(self.root, {catalog.APP_IDS[0]:{'info':info}})
            with self.subTest(info=info), self.assertRaisesRegex(ValueError, 'appinfo'):
                self.generate()

    def test_control_architecture_duplicate_identity_and_foreign_app_payload_are_rejected(self):
        for options in ({'control':'Package: wrong\nVersion: '+VERSION+'\nArchitecture: arm\n'},
                        {'control':f'Package: {catalog.APP_IDS[0]}\nVersion: {VERSION}\nArchitecture: amd64\n'},
                        {'control':f'Package: {catalog.APP_IDS[0]}\nPackage: other\nVersion: {VERSION}\nArchitecture: arm\n'},
                        {'extra':[('usr/palm/applications/other.app/appinfo.json', b'{}', 0o644)]}):
            self.release = fixture(self.root, {catalog.APP_IDS[0]:options})
            with self.subTest(options=options), self.assertRaises(ValueError): self.generate()

    def test_native_payload_must_be_arm_and_contain_the_exact_compiled_source(self):
        for binary in (b'not an ARM runtime', b'\x7fELF\x01'+b'\0'*13+b'\x28\x00'+b'wrong-source',
                       b'\x7fELF\x01'+b'\0'*13+b'\x28\x00'+SOURCE.encode()+catalog.APP_IDS[1].encode()):
            self.release = fixture(self.root, {catalog.APP_IDS[0]:{'binary':binary}})
            with self.subTest(binary=binary), self.assertRaises(ValueError): self.generate()

    def test_duplicate_embedded_manifest_is_rejected(self):
        name = 'usr/palm/applications/' + catalog.APP_IDS[0] + '/appinfo.json'
        self.release = fixture(self.root, {catalog.APP_IDS[0]:{'extra':[(name,b'{}',0o644)]}})
        with self.assertRaises(ValueError): self.generate()

    def test_bootstrap_from_old_one_package_catalog_but_never_downgrade_or_replace_same_version_bytes(self):
        result = self.generate()
        old = copy.deepcopy(result); old['packages'] = old['packages'][1:]
        old['packages'][0]['manifest']['version'] = '1.2.5'
        catalog.validate_update(old, result)
        for version in ['2.7.0','2.6.30','3.0.0']:
            newer = copy.deepcopy(result);newer['packages'][0]['manifest']['version'] = version
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'downgrade'):
                catalog.validate_update(newer, result)
        changed = copy.deepcopy(result);changed['packages'][0]['manifest']['ipkHash']['sha256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'new app version'):catalog.validate_update(changed, result)
        partial = copy.deepcopy(result);partial['packages'].pop()
        with self.assertRaises(ValueError):catalog.validate_update(result, partial)

    def test_publication_is_one_atomic_update_and_idempotent(self):
        result = self.generate();old = {'packages':[]};calls = []
        def api(repository, path, payload=None, method='GET'):
            calls.append((path,payload,method))
            if payload is not None:
                self.assertEqual(payload['sha'],'initial')
                self.assertEqual(payload['branch'],'main')
                self.assertEqual(json.loads(base64.b64decode(payload['content'])),result)
                return {}
            current = result if len(calls)>2 else old
            return {'sha':'initial','content':base64.b64encode(json.dumps(current).encode()).decode()}
        with patch.object(catalog,'api',side_effect=api):catalog.publish_catalog(REPOSITORY,result,TAG)
        self.assertEqual(sum(c[1] is not None for c in calls),1)
        current = {'sha':'same','content':base64.b64encode(json.dumps(result).encode()).decode()}
        with patch.object(catalog,'api',return_value=current) as mocked:
            catalog.publish_catalog(REPOSITORY,result,TAG);self.assertEqual(mocked.call_count,1)

    def test_concurrent_publication_rechecks_newest_version_instead_of_overwriting(self):
        result = self.generate();newer = copy.deepcopy(result)
        newer['packages'][0]['manifest']['version'] = '2.6.30'
        def existing(value):return {'sha':'tip','content':base64.b64encode(json.dumps(value).encode()).decode()}
        with patch.object(catalog,'api',side_effect=[existing({'packages':[]}),RuntimeError('HTTP 409'),existing(newer)]) as mocked:
            with self.assertRaisesRegex(ValueError,'downgrade'):catalog.publish_catalog(REPOSITORY,result,TAG)
            self.assertEqual(mocked.call_count,3)

    def test_cli_failure_keeps_last_good_output_and_never_publishes(self):
        output = self.root / 'repo.json';output.write_text('last good feed')
        argv = ['updater','--repository',REPOSITORY,'--tag',TAG,'--output',str(output),'--publish']
        with patch.object(sys,'argv',argv),patch.object(catalog,'find_release',return_value=dict(self.release,assets=[])),patch.object(catalog,'publish_catalog') as publish:
            with self.assertRaises(ValueError):catalog.main()
            self.assertEqual(output.read_text(),'last good feed');publish.assert_not_called()

    def test_draft_attachment_waits_without_downloading_or_publishing(self):
        argv = ['updater','--repository',REPOSITORY,'--tag',TAG,'--output',str(self.root/'feed'), '--skip-draft','--publish']
        with patch.object(sys,'argv',argv),patch.object(catalog,'find_release',return_value={'draft':True}),patch.object(catalog,'download_assets') as download,patch.object(catalog,'publish_catalog') as publish:
            catalog.main();download.assert_not_called();publish.assert_not_called()
            self.assertFalse((self.root/'feed').exists())

    def test_tag_resolution_supports_annotated_tags_and_rejects_missing_source(self):
        with patch.object(catalog,'api',side_effect=[{'object':{'type':'tag','sha':'b'*40}}, {'object':{'type':'commit','sha':SOURCE}}]):
            self.assertEqual(catalog.tag_commit(REPOSITORY,TAG),SOURCE)
        with patch.object(catalog,'api',return_value={'object':{'type':'tree','sha':SOURCE}}):
            with self.assertRaises(ValueError):catalog.tag_commit(REPOSITORY,TAG)


if __name__ == '__main__':
    unittest.main()
