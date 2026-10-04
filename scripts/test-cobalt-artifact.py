#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
import tempfile
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('artifact', ROOT / 'scripts/verify-cobalt-artifact.py')
artifact = importlib.util.module_from_spec(spec); spec.loader.exec_module(artifact)
REPO = 'owner/project'
SHA = 'a' * 40
METADATA = {'repository': REPO, 'source_ref': 'playback/host-tested-v2', 'source_sha': SHA,
            'cobalt_ref': '23.lts.6', 'cobalt_source_sha': 'b' * 40, 'starboard_api': '13',
            'build_type': 'gold', 'archive': 'cobalt-23.lts.6-sb13-gold-source.tar.xz'}
RUN = {'status': 'completed', 'conclusion': 'success', 'path': '.github/workflows/build-starterless-cobalt.yml',
       'head_repository': {'full_name': REPO}, 'head_sha': SHA}

def text(values):
    return ''.join(f'{key}={value}\n' for key, value in values.items())

class ArtifactTests(unittest.TestCase):
    def test_accepts_exact_runtime_source_including_non_default_branch(self):
        self.assertEqual(artifact.validate(text(METADATA), RUN, REPO), METADATA)

    def test_rejects_failed_wrong_workflow_foreign_repo_and_mismatched_commit(self):
        for changed in ({'conclusion':'failure'}, {'status':'in_progress'}, {'path':'.github/workflows/ci.yml'},
                        {'head_repository':{'full_name':'someone/else'}}, {'head_sha':'c'*40}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                artifact.validate(text(METADATA), dict(RUN, **changed), REPO)

    def test_rejects_ambiguous_metadata_and_output_line_injection(self):
        for value in (text(METADATA)+'source_sha='+SHA+'\n',
                      text(dict(METADATA, source_ref='main\nsource_sha=bad')),
                      text(dict(METADATA, archive='../../runtime.tar.xz')),
                      text(dict(METADATA, cobalt_source_sha='23.lts.6'))):
            with self.subTest(value=value), self.assertRaises(ValueError):
                artifact.validate(value, RUN, REPO)

    def test_cli_verifies_checksum_before_emitting_checkout_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / METADATA['archive']
            archive.write_bytes(b'fixture archive bytes')
            (root / 'metadata').write_text(text(METADATA))
            (root / 'run.json').write_text(json.dumps(RUN))
            checksum = root / (archive.name + '.sha256')
            command = [sys.executable, str(ROOT / 'scripts/verify-cobalt-artifact.py'),
                       '--metadata', str(root / 'metadata'), '--run', str(root / 'run.json'),
                       '--repository', REPO, '--archive', str(archive), '--output', str(root / 'output')]
            checksum.write_text('0' * 64 + '  ' + archive.name + '\n')
            failed = subprocess.run(command, capture_output=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertFalse((root / 'output').exists())
            checksum.write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(dict(line.split('=', 1) for line in (root / 'output').read_text().splitlines()),
                             {key: METADATA[key] for key in ('source_ref', 'source_sha', 'cobalt_ref', 'cobalt_source_sha', 'build_type')})

if __name__ == '__main__':
    unittest.main()
