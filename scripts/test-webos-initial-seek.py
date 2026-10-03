#!/usr/bin/env python3
"""Reproduce lost early resume using actual upstream and patched DOM methods."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
cobalt = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('seek_helper', root / 'scripts/test-external-video-seek.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
path = 'cobalt/dom/html_media_element.cc'
original = subprocess.check_output(['git', '-C', str(cobalt), 'show', 'HEAD:' + path], text=True)
patched = (cobalt / path).read_text()
assert 'ApplyWebOsInitialPlaybackPosition();' in helper.method(patched, 'void HTMLMediaElement::SetReadyState(')
assert 'webos_initial_playback_position_ = 0;' in helper.method(patched, 'void HTMLMediaElement::PrepareForLoad(')
fixture = r'''
#include <algorithm>
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <vector>
#define LOG(level) std::cerr
#define MLOG() std::cerr
namespace script {struct ExceptionState {bool raised=false;};}
namespace web {struct DOMException {
 enum {kInvalidStateErr};
 static void Raise(int, script::ExceptionState* state){state->raised=true;}
};}
struct WebMediaPlayer {enum ReadyState {kReadyStateHaveNothing,kReadyStateHaveMetadata};};
struct Player {float GetCurrentTime() const{return 0;}};
struct HTMLMediaElement {
 WebMediaPlayer::ReadyState ready_state_=WebMediaPlayer::kReadyStateHaveNothing;
 Player instance;Player* player_=&instance;
 bool seeking_=false;float last_seek_time_=0,webos_initial_playback_position_=0;
 std::vector<float> seeks;
 float current_time(script::ExceptionState*) const;
 void set_current_time(float,script::ExceptionState*);
 void ApplyWebOsInitialPlaybackPosition();
 void Seek(float time){seeks.push_back(time);last_seek_time_=time;seeking_=true;}
};
// METHODS
int main(){
 HTMLMediaElement media;script::ExceptionState error;
#if !defined(STARBOARD_WEBOS)
 media.set_current_time(90,&error);
 assert(error.raised && media.seeks.empty() && media.current_time(&error)==0);
#else
 media.set_current_time(100,&error);media.set_current_time(200,&error);media.set_current_time(90,&error);
 assert(!error.raised && media.seeks.empty() && media.current_time(&error)==90);
 media.set_current_time(std::numeric_limits<float>::infinity(),&error);
 assert(media.current_time(&error)==90);
 media.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;
 media.ApplyWebOsInitialPlaybackPosition();
 assert((media.seeks==std::vector<float>{90}) && media.current_time(&error)==90);
 media.ApplyWebOsInitialPlaybackPosition();assert(media.seeks.size()==1);
 media.set_current_time(30,&error);assert(media.seeks.back()==30);
 HTMLMediaElement zero;zero.set_current_time(90,&error);zero.set_current_time(0,&error);
 assert(zero.current_time(&error)==0);zero.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;
 zero.ApplyWebOsInitialPlaybackPosition();assert(zero.seeks.empty());
 HTMLMediaElement negative;negative.set_current_time(-1,&error);assert(negative.current_time(&error)==0);
#endif
}
'''
with tempfile.TemporaryDirectory(prefix='ytaf-initial-seek-') as temporary:
    for name, source in [('original', original), ('patched', patched)]:
        methods = '\n'.join(helper.method(source, signature) for signature in (
            'float HTMLMediaElement::current_time(', 'void HTMLMediaElement::set_current_time('))
        if name == 'patched':
            methods += '\n' + helper.method(source, 'void HTMLMediaElement::ApplyWebOsInitialPlaybackPosition(')
        cpp, binary = Path(temporary) / (name + '.cc'), Path(temporary) / name
        cpp.write_text(fixture.replace('// METHODS', methods))
        flags = ['-DSTARBOARD_WEBOS'] if name == 'patched' else []
        subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                        '-Wno-unused-parameter', '-fsanitize=undefined', '-fno-sanitize-recover=all',
                        *flags, str(cpp), '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
print('Reproduced rejected pre-metadata resume; patched DOM retains latest target and seeks once at metadata.')
