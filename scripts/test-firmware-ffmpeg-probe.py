#!/usr/bin/env python3
"""Test the actual FFmpeg 59 firmware probe and optional real AAC decoding."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--codec', type=Path)
parser.add_argument('--util', type=Path)
args = parser.parse_args()
if bool(args.codec) != bool(args.util):
    parser.error('--codec and --util must be supplied together')
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    include = root / 'starboard/webos/arm'
    include.mkdir(parents=True)
    for name in ['webos_ffmpeg_probe.h', 'webos_capability_process.h', 'webos_aac_probe_fixture.h']:
        (include / name).symlink_to(ROOT / 'cobalt-platform/webos/arm' / name)
    app, firmware = root / 'app', root / 'firmware'
    app.mkdir(); firmware.mkdir()
    driver = root / 'driver.cc'
    driver.write_text(r'''
#include "starboard/webos/arm/webos_ffmpeg_probe.h"
#include "starboard/webos/arm/webos_capability_process.h"
#include <cstring>
#include <iostream>
using namespace starboard::shared::webos;
int main(int argc, char** argv) {
  if (argc == 4 && !std::strcmp(argv[1], "child")) return RunFirmwareFfmpegProbe(argv[2],argv[3]);
  if (argc != 3) return 2;
  const char* child[] = {argv[0], "child", argv[1], argv[2], nullptr};
  auto result = RunCapabilityProcess(const_cast<char* const*>(child), 1000, 4096);
  std::cout << "status=" << result.status << "\n" << result.output;
}
''')
    compiler = os.environ.get('CXX', 'c++')
    binary = app / 'probe'
    subprocess.run([compiler, '-std=c++14', '-Wall', '-Wextra', '-Werror',
                    '-I'+str(root), '-I'+str(ROOT/'cobalt-platform/webos/arm/ffmpeg5'),
                    str(driver), str(ROOT/'cobalt-platform/webos/arm/webos_ffmpeg_probe.cc'),
                    '-ldl', '-o', str(binary)], check=True)
    util, codec = firmware / 'libavutil.so.57', firmware / 'libavcodec.so.59'
    def build(path, source):
        cpp = root / 'fake.cc'; cpp.write_text(source)
        subprocess.run([compiler, '-shared', '-fPIC', str(cpp), '-o', str(path)], check=True)
    def run(c=codec, u=util, env=None):
        return subprocess.check_output([str(binary), str(c), str(u)], text=True, timeout=4, env=env)
    assert 'avutil-load-error=' in run()
    build(util, 'extern "C" unsigned avutil_version(){return 59u<<16;}')
    assert 'unsupported-avutil-ABI' in run()
    util_version = 'extern "C" unsigned avutil_version(){return (57u<<16)|(17u<<8)|100;}'
    build(util, util_version)
    assert 'avcodec-load-error=' in run()
    shutil.copyfile(util, app / 'local.so')
    assert 'not-firmware=app-local' in run(u=app/'local.so')
    build(codec, 'extern "C" unsigned avcodec_version(){return 61u<<16;}')
    assert 'unsupported-avcodec-ABI' in run()
    codec_version = 'extern "C" unsigned avcodec_version(){return (59u<<16)|(18u<<8)|100;}'
    build(codec, codec_version)
    assert 'missing-symbol=avcodec_find_decoder' in run()
    # Only version/find_decoder execute in this missing-decoder fixture.
    build(util, util_version + '\n' + '\n'.join(
        'extern "C" void '+name+'() {}' for name in
        ['av_frame_alloc','av_frame_free','av_frame_unref','av_strerror']))
    build(codec, codec_version + '\nextern "C" void* avcodec_find_decoder(int){return nullptr;}\n' +
          '\n'.join('extern "C" void '+name+'() {}' for name in
                    ['avcodec_alloc_context3','avcodec_open2','avcodec_free_context',
                     'avcodec_send_packet','avcodec_receive_frame','av_packet_alloc',
                     'av_packet_free','av_packet_unref','av_new_packet']))
    assert 'aac-decoder=not-available' in run()
    build(codec, '#include <unistd.h>\n__attribute__((constructor)) void hang(){for(;;)pause();}')
    assert 'status=timeout' in run()
    build(codec, '#include <cstdlib>\n__attribute__((constructor)) void crash(){std::abort();}')
    assert 'status=crashed' in run()
    if args.codec:
        env = dict(os.environ, LD_LIBRARY_PATH=str(args.util.resolve().parent))
        result = run(args.codec.resolve(), args.util.resolve(), env)
        assert 'status=ok' in result and 'decode=PASS firmware FFmpeg AAC' in result, result
        assert 'pass=1' in result and 'pass=2' in result and 'non-silent=yes' in result
        print(result.strip())
print('FFmpeg probe: library/ABI/symbol/decoder rejection, app-local exclusion and crash/timeout containment passed')
