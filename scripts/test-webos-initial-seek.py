#!/usr/bin/env python3
"""Exercise real DOM Seek: metadata and an empty MSE range are separate states."""
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
initial_patch = (root / 'cobalt-platform/cobalt-23.lts.6-webos-initial-playback-position.patch').read_text()
added = '\n'.join(line[1:] for line in initial_patch.splitlines() if line.startswith('+') and not line.startswith('+++'))
baseline_apply = helper.method(added, 'void HTMLMediaElement::ApplyWebOsInitialPlaybackPosition(')
for signature in ['void HTMLMediaElement::SetReadyState(', 'void HTMLMediaElement::TimeChanged(',
                  'void HTMLMediaElement::OnPlaybackProgressTimer(', 'void HTMLMediaElement::DurationChanged()']:
    assert 'ApplyWebOsInitialPlaybackPosition();' in helper.method(patched, signature), signature
assert 'webos_initial_playback_position_ = 0;' in helper.method(patched, 'void HTMLMediaElement::PrepareForLoad(')
fixture = r'''
#include <algorithm>
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <memory>
#include <vector>
#define LOG(level) std::cerr
#define MLOG() std::cerr
namespace script {struct ExceptionState {bool raised=false;};}
namespace web {struct DOMException {
 enum {kInvalidStateErr};
 static void Raise(int, script::ExceptionState* state){state->raised=true;}
};}
namespace base {struct Tokens {
 static int seeking(){return 1;} static int seeked(){return 2;}
};}
struct WebMediaPlayer {enum ReadyState {kReadyStateHaveNothing,kReadyStateHaveMetadata};};
constexpr int kMediaSourceReadyStateClosed = 0;
struct Source {int ready_state() const {return 1;}};
struct TimeRanges {
 unsigned count=0;
 unsigned length() const{return count;}
 double Nearest(double time) const {return count ? std::max(0.0,std::min(300.0,time)) : 0.0;}
};
template<class T>using scoped_refptr=std::shared_ptr<T>;
struct Player {std::vector<float> seeks;float GetCurrentTime() const{return 0;}
 void Seek(float time){seeks.push_back(time);}
};
struct HTMLMediaElement {
 WebMediaPlayer::ReadyState ready_state_=WebMediaPlayer::kReadyStateHaveNothing;
 Player instance;Player* player_=&instance;Source source;Source* media_source_=&source;
 bool seeking_=false,playing_=false,sent_end_event_=false;
 float last_seek_time_=0,webos_initial_playback_position_=0;
 scoped_refptr<TimeRanges> ranges{new TimeRanges};
 scoped_refptr<TimeRanges> seekable() const{return ranges;}
 float duration() const{return 300;}
 void ScheduleOwnEvent(int){} void ScheduleTimeupdateEvent(bool){}
 void AddPlayedRange(float,float){}
 float current_time(script::ExceptionState*) const;
 void set_current_time(float,script::ExceptionState*);
 void ApplyWebOsInitialPlaybackPosition();
 void Seek(float time);
};
// METHODS
int main(){
 HTMLMediaElement media;script::ExceptionState error;
#if MODE == 0
 media.set_current_time(90,&error);
 assert(error.raised && media.instance.seeks.empty() && media.current_time(&error)==0);
#elif MODE == 1
 media.set_current_time(90,&error);assert(!error.raised);
 media.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;
 media.ApplyWebOsInitialPlaybackPosition();
 // The previous fix silently converted an account bookmark to zero here.
 assert((media.instance.seeks==std::vector<float>{0}));
 media.ranges->count=1;media.ApplyWebOsInitialPlaybackPosition();
 assert((media.instance.seeks==std::vector<float>{0}));
#else
 media.set_current_time(100,&error);media.set_current_time(200,&error);media.set_current_time(90,&error);
 assert(!error.raised && media.instance.seeks.empty() && media.current_time(&error)==90);
 media.set_current_time(std::numeric_limits<float>::infinity(),&error);
 assert(media.current_time(&error)==90);
 media.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;
 for(int i=0;i<100;i++)media.ApplyWebOsInitialPlaybackPosition();
 assert(media.instance.seeks.empty() && media.webos_initial_playback_position_==90);
 media.ranges->count=1;media.ApplyWebOsInitialPlaybackPosition();
 assert((media.instance.seeks==std::vector<float>{90}) && media.current_time(&error)==90);
 media.ApplyWebOsInitialPlaybackPosition();assert(media.instance.seeks.size()==1);
 HTMLMediaElement late;late.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;
 late.set_current_time(80,&error);late.set_current_time(120,&error);
 assert(late.instance.seeks.empty() && late.webos_initial_playback_position_==120);
 late.ranges->count=1;late.ApplyWebOsInitialPlaybackPosition();
 assert((late.instance.seeks==std::vector<float>{120}));
 HTMLMediaElement zero;zero.set_current_time(90,&error);zero.set_current_time(0,&error);
 zero.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;zero.ranges->count=1;
 zero.ApplyWebOsInitialPlaybackPosition();assert(zero.instance.seeks.empty());
 HTMLMediaElement reset;reset.set_current_time(90,&error);reset.webos_initial_playback_position_=0;
 reset.ready_state_=WebMediaPlayer::kReadyStateHaveMetadata;reset.ranges->count=1;
 reset.ApplyWebOsInitialPlaybackPosition();assert(reset.instance.seeks.empty());
#endif
}
'''
with tempfile.TemporaryDirectory(prefix='ytaf-initial-seek-') as temporary:
    for mode, name in enumerate(['original', 'previous-fix', 'patched']):
        source = original if mode == 0 else patched
        methods = '\n'.join(helper.method(source, signature) for signature in (
            'float HTMLMediaElement::current_time(', 'void HTMLMediaElement::set_current_time('))
        methods += '\n' + helper.method(original if mode < 2 else patched, 'void HTMLMediaElement::Seek(')
        if mode:
            methods += '\n' + (baseline_apply if mode == 1 else helper.method(patched, 'void HTMLMediaElement::ApplyWebOsInitialPlaybackPosition('))
        cpp, binary = Path(temporary) / (name + '.cc'), Path(temporary) / name
        cpp.write_text(fixture.replace('// METHODS', methods))
        flags = ['-DSTARBOARD_WEBOS'] if mode else []
        subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                        '-Wno-unused-parameter', '-fsanitize=undefined', '-fno-sanitize-recover=all',
                        f'-DMODE={mode}', *flags, str(cpp), '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
print('Reproduced both rejected early resume and previous empty-range seek-to-zero; real corrected Seek retains the latest target until seekable.')
