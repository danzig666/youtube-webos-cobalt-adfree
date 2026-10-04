#!/usr/bin/env python3
"""Exercise the real asynchronous bridge and isolated optional vendor probe on host."""
import json, os, subprocess, tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    platform = temp / 'starboard/webos/arm'
    platform.mkdir(parents=True)
    for name in ['webos_capability_test.h', 'webos_capability_process.h', 'webos_build_metadata.h']:
        (platform / name).symlink_to(root / 'cobalt-platform/webos/arm' / name)
    driver = temp / 'driver.cc'
    driver.write_text(r'''
#include "starboard/webos/arm/webos_capability_test.h"
#include <cassert>
#include <cstring>
#include <iostream>
#include <unistd.h>
using namespace starboard::shared::webos;
int main(int argc, char** argv) {
 if(argc==2 && !std::strcmp(argv[1],"--ytaf-capability-probe")) return RunWebOsCapabilityProbe();
 assert(GetWebOsCapabilityTestReport()=="{\"state\":\"idle\"}");
 assert(StartWebOsCapabilityTest());
 for(int i=0;i<900;++i) {const auto report=GetWebOsCapabilityTestReport();
  if(report.find("\"done\"")!=std::string::npos){std::cout<<report;return 0;}usleep(10000);}
 return 1;
}
''')
    executable = temp / 'driver'
    flags = [os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror', '-pthread', '-I'+str(temp)]
    subprocess.run(flags + [str(driver), str(root/'cobalt-platform/webos/arm/webos_capability_test.cc'), '-ldl', '-o', str(executable)], check=True)
    baseline = json.loads(subprocess.check_output([str(executable)], timeout=12))
    assert baseline['state'] == 'done' and baseline['config']['status'] == 'unavailable'
    assert baseline['decoder']['status'] == 'ok' and 'library-unavailable' in baseline['decoder']['body']
    fake = temp/'vendor.cc'
    fake.write_text(r'''
#include <string>
namespace smp { namespace util {
bool getMaxVideoResolution(std::string codec, int* w, int* h, int* fps) {
 *w=codec=="H264"?1920:3840;*h=codec=="H264"?1080:2160;*fps=60;return codec!="AV1";
}
}}
''')
    library = temp/'libplayerAPIs.so.1'
    subprocess.run(flags + ['-shared','-fPIC',str(fake),'-o',str(library)],check=True)
    env = dict(os.environ, LD_LIBRARY_PATH=str(temp)+':'+os.environ.get('LD_LIBRARY_PATH',''))
    success = json.loads(subprocess.check_output([str(executable)],env=env,timeout=12))
    assert success['decoder']['status'] == 'ok'
    assert success['decoder']['body'] == 'H264=1920,1080,60\nVP9=3840,2160,60\nAV1=unknown\n'
    fake.write_text('#include <string>\n#include <unistd.h>\nnamespace smp { namespace util {bool getMaxVideoResolution(std::string,int*,int*,int*) {for(;;)pause();}}}\n')
    subprocess.run(flags + ['-shared','-fPIC',str(fake),'-o',str(library)],check=True)
    stalled = json.loads(subprocess.check_output([str(executable)],env=env,timeout=12))
    assert stalled['decoder'] == {'status':'timeout','body':''}
    print('Real capability bridge: unavailable APIs, vendor ABI query, and isolated timeout passed')
