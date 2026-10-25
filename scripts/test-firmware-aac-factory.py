#!/usr/bin/env python3
"""Compile the actual AAC admission condition with and without optional FDK."""
import os,subprocess,sys,tempfile
from pathlib import Path
root=Path(sys.argv[1]);source=(root/'starboard/linux/shared/player_components_factory.cc').read_text()
start=source.index('} else if (audio_sample_info.codec == kSbMediaAudioCodecAac')
condition=source[source.index('(',start):source.index(') {',start)+1]
code=r'''
#include <cassert>
constexpr int kSbMediaAudioCodecAac=1;
struct Info {int codec=1;int number_of_channels=2;} audio_sample_info;
struct FdkAacAudioDecoder {static constexpr int kMaxChannels=8;};
int loads=0;bool available=false;
namespace libfdkaac { struct LibfdkaacHandle {
 static LibfdkaacHandle* GetHandle(){++loads;static LibfdkaacHandle h;return &h;}
 bool IsLoaded(){return available;}
};}
bool admitted(){if CONDITION {return true;}return false;}
int main(){
#ifdef STARBOARD_WEBOS
 assert(admitted());assert(loads==0);
#else
 assert(!admitted());assert(loads==1);available=true;assert(admitted());
#endif
 loads=0;audio_sample_info.number_of_channels=9;assert(!admitted());assert(loads==0);
}
'''.replace('CONDITION',condition)
with tempfile.TemporaryDirectory() as t:
 d=Path(t);p=d/'test.cc';p.write_text(code)
 for flags in [[],['-DSTARBOARD_WEBOS']]:
  subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror',*flags,str(p),'-o',str(d/'test')],check=True)
  subprocess.run([str(d/'test')],check=True)
print('Actual webOS AAC factory admits firmware audio without loading FDK; other platforms and channel limits preserved')
