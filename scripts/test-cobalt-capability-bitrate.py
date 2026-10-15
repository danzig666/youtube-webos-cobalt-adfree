#!/usr/bin/env python3
"""Run the pinned Cobalt MIME parser's real bitrate parsing and validation."""
import importlib.util,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('extract',ROOT/'scripts/test-external-video-seek.py');helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
source=(Path(sys.argv[1])/'starboard/shared/starboard/media/mime_type.cc').read_text()
parse=helper.method(source,'void ParseParamTypeAndValue(')
validate=helper.method(source,'bool MimeType::ValidateIntParameter(')
fixture=r'''
#include <cassert>
#include <cstdio>
#include <locale>
#include <sstream>
#include <string>
#define SB_DCHECK assert
#define SbStringScanF std::sscanf
class MimeType {public:
 enum ParamType{kParamTypeInteger,kParamTypeFloat,kParamTypeString,kParamTypeBoolean};
 struct Param{std::string name,string_value;ParamType type;int int_value;float float_value;bool bool_value;};
 Param param;static constexpr int kInvalidParamIndex=-1;
 bool is_valid()const{return true;}
 int GetParamIndexByName(const char* name)const{return param.name==name?0:kInvalidParamIndex;}
 ParamType GetParamType(int)const{return param.type;}
 bool ValidateIntParameter(const char* name)const;
};
PARSE
VALIDATE
int main(){MimeType m;
 ParseParamTypeAndValue("bitrate","4241906.25",&m.param);
 assert(m.param.type==MimeType::kParamTypeFloat);assert(!m.ValidateIntParameter("bitrate"));
 ParseParamTypeAndValue("bitrate","4241907",&m.param);
 assert(m.ValidateIntParameter("bitrate"));assert(m.param.int_value==4241907);
 ParseParamTypeAndValue("bitrate","\"4241906.25\"",&m.param);
 assert(!m.ValidateIntParameter("bitrate"));
}
'''.replace('PARSE',parse).replace('VALIDATE',validate)
with tempfile.TemporaryDirectory(prefix='ytaf-bitrate-') as folder:
 path=Path(folder);(path/'test.cc').write_text(fixture)
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror','-Wno-sign-compare','-fsanitize=undefined','-fno-sanitize-recover=all',str(path/'test.cc'),'-o',str(path/'test')],check=True)
 subprocess.run([str(path/'test')],check=True)
print('Actual Cobalt parser rejects decimal/quoted bitrate and accepts the normalized integer')
