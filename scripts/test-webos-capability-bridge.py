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
 if(argc==2 && !std::strcmp(argv[1],"--ytaf-lg-config-probe")) return RunWebOsLgCapabilityProbe(true);
 if(argc==2 && !std::strcmp(argv[1],"--ytaf-lg-system-probe")) return RunWebOsLgCapabilityProbe(false);
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

    # Real direct-LS2 transport against a small dynamically loaded SDK-ABI fixture.
    # No /usr/bin mutation or host bus/service access is involved.
    fake.write_text('#include <string>\nnamespace smp { namespace util {bool getMaxVideoResolution(std::string,int*,int*,int*) {return false;}}}\n')
    subprocess.run(flags + ['-shared','-fPIC',str(fake),'-o',str(library)],check=True)
    luna_fixture=temp/'luna.cc'
    luna_fixture.write_text(r'''
#include <cassert>
#include <cstdlib>
#include <cstring>
struct Error {int error_code;char* message;const char* file;int line;const char* func;void* padding;unsigned long magic;};
using Callback=bool(*)(void*,void*,void*);
struct Context {Callback callback;void* user;const char* payload;};
struct Handle {Context* context;};
const char* scenario(){const char* s=std::getenv("YTAF_LUNA_TEST_CASE");return s?s:"success";}
bool denied(){return !std::strcmp(scenario(),"register-denied");}
extern "C" {
bool LSErrorInit(Error* e){std::memset(e,0,sizeof(*e));return true;}
void LSErrorFree(Error*){}
#ifdef YTAF_LEGACY_PUBLIC
bool LSRegisterPubPriv(const char* name,void** out,bool public_bus,Error* e){
 assert(!name && public_bus);if(denied()){e->error_code=-1027;return false;}
 *out=new Handle{};return true;
}
#else
bool LSRegisterApplicationService(const char* name,const char* app,void** out,Error* e){
 assert(!name && !std::strcmp(app,"com.cobalt.youtube.adfree"));
 if(denied()){e->error_code=-1027;return false;}*out=new Handle{};return true;
}
#endif
bool LSUnregister(void* handle,Error*){delete static_cast<Handle*>(handle);return true;}
bool LSGmainContextAttach(void* handle,void* context,Error*){static_cast<Handle*>(handle)->context=static_cast<Context*>(context);return true;}
bool LSCallOneReply(void* handle,const char* uri,const char* params,Callback callback,void* user,unsigned long* token,Error* e){
 assert(std::strstr(params,"configNames")||std::strstr(params,"keys"));
 if(!std::strcmp(scenario(),"call-failed")){e->error_code=-1027;return false;}
 auto* c=static_cast<Handle*>(handle)->context;c->callback=callback;c->user=user;*token=1;
 c->payload=std::strstr(uri,"getConfigs")?"{\"returnValue\":true,\"configs\":{\"tv.hw.panelResolution\":\"UD\",\"tv.model.supportHDR\":true}}":"{\"returnValue\":true,\"modelName\":\"OLED55C3\",\"sdkVersion\":\"8.3.0\",\"UHD\":\"true\"}";
 if(!std::strcmp(scenario(),"service-denied")) c->payload="{\"returnValue\":false,\"errorCode\":-1,\"errorText\":\"Permission denied; secret URL\"}";
 if(!std::strcmp(scenario(),"empty")) c->payload="";
 return true;
}
// This models the real LS2 privilege gate that failed on C3 in 2.6.20.
bool LSCallFromApplicationOneReply(void*,const char*,const char*,const char*,Callback,void*,unsigned long*,Error* e){e->error_code=-1031;return false;}
const char* LSMessageGetPayload(void* message){return static_cast<Context*>(message)->payload;}
void* g_main_context_new(){return new Context{};}
void g_main_context_unref(void* context){delete static_cast<Context*>(context);}
int g_main_context_iteration(void* context,int block){
 assert(!block);auto* c=static_cast<Context*>(context);
 if(!std::strcmp(scenario(),"timeout"))return 0;
 if(c->callback){auto cb=c->callback;c->callback=nullptr;assert(cb(nullptr,c,c->user));}return 1;
}
}
''')
    luna_library=temp/'libluna-service2.so.3'
    subprocess.run(flags+['-shared','-fPIC',str(luna_fixture),'-o',str(luna_library)],check=True)
    (temp/'libglib-2.0.so.0').symlink_to(luna_library.name)
    for case in ['success','register-denied','call-failed','service-denied','empty','timeout']:
        result=json.loads(subprocess.check_output([str(executable)],env=dict(env,YTAF_LUNA_TEST_CASE=case),timeout=12))
        for key in ['config','system']:
            assert result[key]['backend']=='ls2' and result[key]['status']=='ok',result[key]
            reply=json.loads(result[key]['body'])
            if case=='success':assert json.loads(reply['payload'])['returnValue'] is True
            elif case=='register-denied':assert reply['ytafLuna']=={'stage':'register','reason':'permission-denied','code':-1027}
            elif case=='call-failed':assert reply['ytafLuna']['stage']=='call' and reply['ytafLuna']['code']==-1027
            elif case=='service-denied':assert json.loads(reply['payload'])['returnValue'] is False
            elif case=='empty':assert reply['payload']==''
            else:assert reply['ytafLuna']['reason']=='timeout'
    subprocess.run(flags+['-DYTAF_LEGACY_PUBLIC','-shared','-fPIC',str(luna_fixture),'-o',str(luna_library)],check=True)
    public=json.loads(subprocess.check_output([str(executable)],env=env,timeout=12))
    assert json.loads(json.loads(public['config']['body'])['payload'])['returnValue'] is True
    print('Direct LS2: own app identity, legacy public bus, successful replies, permission denial, call failure, empty replies and timeout passed')
    print('Real capability bridge: unavailable APIs, vendor ABI query, and isolated timeout passed')
