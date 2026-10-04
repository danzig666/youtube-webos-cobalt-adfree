#!/usr/bin/env python3
"""Run real legacy decoder methods with fake firmware/thread boundaries."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('seek_test', root / 'scripts/test-external-video-seek.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
source = (root / 'cobalt-platform/webos/arm/starfish_video_decoder.cc').read_text()
methods = '\n'.join(helper.method(source, signature) for signature in (
    ('bool' if 'bool StarfishVideoDecoder::InitializePipeline(' in source else 'void') + ' StarfishVideoDecoder::InitializePipeline(',
    'void StarfishVideoDecoder::FeedBuffer(',
    'void StarfishVideoDecoder::ApplyPlaybackStateOnDecoderThread(',
    'void StarfishVideoDecoder::EnsurePlayingOnDecoderThread(',
    'void StarfishVideoDecoder::OnLoadCompletedOnDecoderThread(',
    'void StarfishVideoDecoder::HandlePlayerEvent(',
    'void StarfishVideoDecoder::WriteEndOfStreamOnDecoderThread(',
    'void StarfishVideoDecoder::Reset(',
    'void StarfishVideoDecoder::ResetOnDecoderThread(',
    'AdaptiveVideoCapabilities GetAdaptiveVideoCapabilities(',
))
fixture = (root / 'scripts/test-starfish-video-decoder-fixture.cc').read_text()
fixture = fixture.replace('INITIALIZE_RESULT', 'bool' if methods.startswith('bool') else 'void')
with tempfile.TemporaryDirectory(prefix='ytaf-legacy-') as temp:
    cpp, binary = Path(temp) / 'test.cc', Path(temp) / 'test'
    cpp.write_text(fixture.replace('// INSERT_REAL_METHODS', methods))
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                    '-pthread', '-fsanitize=undefined,float-cast-overflow', '-fno-sanitize-recover=all',
                    '-I' + str(root / 'cobalt-platform/webos/arm'), str(cpp),
                    str(root / 'cobalt-platform/webos/arm/starfish_playback_rate.cc'),
                    '-o', str(binary)], check=True)
    failed = []
    for scenario in ('configuration', 'timestamp', 'rate_startup', 'seek', 'frame_rate', 'eos'):
        result = subprocess.run([str(binary), scenario])
        if result.returncode:
            failed.append(scenario)
    if failed:
        raise RuntimeError(f'Legacy decoder regressions failed: {failed}')
print('Real legacy decoder admission, timestamp and asynchronous rate regressions passed')
