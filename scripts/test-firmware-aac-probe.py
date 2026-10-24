#!/usr/bin/env python3
"""Exercise the real isolated firmware probe, optionally using real FDK decoding."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('cobalt', type=Path)
parser.add_argument('--library', type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    platform = root / 'starboard/webos/arm'
    platform.mkdir(parents=True)
    for name in ['webos_aac_probe.h', 'webos_aac_probe_fixture.h', 'webos_capability_process.h']:
        (platform / name).symlink_to(ROOT / 'cobalt-platform/webos/arm' / name)
    app = root / 'app'
    (app / 'lib').mkdir(parents=True)
    firmware = root / 'firmware'
    firmware.mkdir()
    driver = root / 'driver.cc'
    driver.write_text(r'''
#include "starboard/webos/arm/webos_aac_probe.h"
#include "starboard/webos/arm/webos_capability_process.h"
#include <iostream>
#include <cstring>
using namespace starboard::shared::webos;
int main(int argc, char** argv) {
  if (argc == 3 && !std::strcmp(argv[1], "--ytaf-aac-probe"))
    return RunFirmwareAacProbe(argv[2]);
  if (argc != 2) return 2;
  const char* child[] = {argv[0], "--ytaf-aac-probe", argv[1], nullptr};
  auto result = RunCapabilityProcess(const_cast<char* const*>(child), 200, 2048);
  std::cout << "status=" << result.status << "\n" << result.output;
}
''')
    compiler = os.environ.get('CXX', 'c++')
    executable = app / 'probe'
    subprocess.run([compiler, '-std=c++14', '-Wall', '-Wextra', '-Werror', '-I'+str(root),
                    '-I'+str(args.cobalt.resolve()), str(driver),
                    str(ROOT / 'cobalt-platform/webos/arm/webos_aac_probe.cc'),
                    '-ldl', '-o', str(executable)], check=True)
    def run(path):
        return subprocess.check_output([str(executable), str(path)], text=True, timeout=3)
    assert 'load-error=' in run(root / 'missing.so')
    source = root / 'fake.cc'
    library = firmware / 'libfdk-aac.so.2'
    def build(code, path=library):
        source.write_text(code)
        subprocess.run([compiler, '-shared', '-fPIC', str(source), '-o', str(path)], check=True)
    build('extern "C" void irrelevant() {}\n')
    assert 'missing-symbol=aacDecoder_Open' in run(library)
    build('extern "C" void aacDecoder_Open() {}\n')
    assert 'missing-symbol=aacDecoder_Close' in run(library)
    shutil.copyfile(library, app / 'lib/libfdk-aac.so')
    assert 'not-firmware=app-local-or-unresolved; skipped' in run(app / 'lib/libfdk-aac.so')
    build('#include <unistd.h>\n__attribute__((constructor)) void hang(){for(;;)pause();}\n')
    assert 'status=timeout' in run(library)
    build('#include <cstdlib>\n__attribute__((constructor)) void crash(){std::abort();}\n')
    assert 'status=crashed' in run(library)
    if args.library:
        shutil.copyfile(args.library.resolve(), library)
        result = run(library)
        assert 'status=ok' in result and 'decode=PASS AAC-LC 48000Hz stereo' in result, result
        print(result.strip())
print('Firmware AAC probe: missing/symbol/app-local rejection, timeout and crash containment passed')
