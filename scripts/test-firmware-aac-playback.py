#!/usr/bin/env python3
"""Exercise the production firmware AAC adapter: timestamps, drain and seek recreation."""
import argparse, os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--codec',type=Path);p.add_argument('--util',type=Path)
a=p.parse_args()
assert bool(a.codec)==bool(a.util)
with tempfile.TemporaryDirectory() as t:
 d=Path(t);inc=d/'starboard/webos/arm';inc.mkdir(parents=True)
 for n in ['webos_firmware_aac.h','webos_aac_probe_fixture.h']:
  (inc/n).symlink_to(ROOT/'cobalt-platform/webos/arm'/n)
 cpp=d/'test.cc';cpp.write_text(r'''
#include "starboard/webos/arm/webos_firmware_aac.h"
#include "starboard/webos/arm/webos_aac_probe_fixture.h"
#include <cassert>
#include <cstring>
#include <cmath>
#include <cstdio>
#include <dlfcn.h>
using namespace starboard::shared::webos;
const char* codec; const char* util;
extern "C" void* __real_dlopen(const char*,int);
extern "C" void* __wrap_dlopen(const char* name,int flags) {
 return __real_dlopen(!std::strcmp(name,"/usr/lib/libavcodec.so.59")?codec:
                     !std::strcmp(name,"/usr/lib/libavutil.so.57")?util:name,flags);
}
int main(int argc,char** argv) {
 assert(argc==3);codec=argv[1];util=argv[2];
 if(!std::strcmp(codec,"missing")){FirmwareAac f;assert(!f.valid());return 0;}
 for(int pass=0;pass<100;++pass) {
  FirmwareAac f;assert(f.valid());std::vector<FirmwareAudioFrame> frames;
  int packet=0;const int64_t base=pass%2?90000000:3000000;
  for(size_t offset=0;offset<sizeof(kAacProbeFixture);) {
   const auto* b=kAacProbeFixture+offset;
   int size=((b[3]&3)<<11)|(b[4]<<3)|(b[5]>>5);
   assert(size>=7 && offset+size<=sizeof(kAacProbeFixture));
   assert(f.Decode(b,size,base+packet*1024LL*1000000/48000,&frames));
   offset+=size;++packet;
  }
  assert(f.Drain(&frames));assert(frames.size()==size_t(packet));
  double energy=0;
  for(size_t i=0;i<frames.size();++i) {
   auto& out=frames[i];assert(out.channels==2 && out.sample_rate==48000);
   assert(out.timestamp==base+int64_t(i)*1024*1000000/48000);
   assert(out.samples.size()==2048);
   for(float v:out.samples){assert(std::isfinite(v));energy+=std::fabs(v);}
  }
  assert(energy>0);
 }
 // Reject malformed input without publishing partially decoded PCM.
 FirmwareAac f;std::vector<FirmwareAudioFrame> out;uint8_t garbage[8]{};
 assert(!f.Decode(garbage,8,0,&out));assert(out.empty());
 assert(!f.Decode(garbage,0,0,&out));assert(!f.Decode(garbage,8,-1,&out));
 puts("Firmware playback AAC: 100 forward/backward seek recreations, PCM timestamps, EOS and invalid input passed");
}
''')
 binary=d/'test'
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror','-fsanitize=undefined','-fno-sanitize-recover=all','-I'+str(d),'-I'+str(ROOT/'cobalt-platform/webos/arm/ffmpeg5'),str(cpp),str(ROOT/'cobalt-platform/webos/arm/webos_firmware_aac.cc'),'-ldl','-Wl,--wrap=dlopen','-o',str(binary)],check=True)
 subprocess.run([str(binary),'missing','missing'],check=True)
 if a.codec:
  subprocess.run([str(binary),str(a.codec.resolve()),str(a.util.resolve())],check=True,env=dict(os.environ,LD_LIBRARY_PATH=str(a.util.resolve().parent)))
print('Firmware playback adapter compile and unavailable-library fallback passed')
