#!/usr/bin/env python3
"""Run Cobalt's actual ownership block with overlapping font-family aliases."""
from pathlib import Path
import os, subprocess, sys, tempfile
root=Path(sys.argv[1])
source=(root/'cobalt/renderer/rasterizer/skia/skia/src/ports/SkFontMgr_cobalt.cc').read_text()
# Include the surrounding conditional if one is ever reintroduced. Otherwise
# testing only the push expression would miss the old duplicate-family bug.
start=source.index('    // Retain every available family.')
end=source.index('    bool is_duplicate_font_face',start)
block=source[start:end]
fixture=r'''
#include <cassert>
#include <vector>
#include <memory>
struct Family {int refs=1; int face=42; bool* destroyed; ~Family(){*destroyed=true;}};
Family* SkRef(Family* f) {++f->refs;return f;}
struct Ptr {Family* value=nullptr;
 void reset(Family* f=nullptr){if(value && --value->refs==0)delete value;value=f;}
 Family* get(){return value;}
 ~Ptr(){reset();}
};
struct Families {std::vector<std::unique_ptr<Ptr>> data;
 Ptr& push_back(){data.emplace_back(new Ptr);return *data.back();}
};
int main(){for(bool is_duplicate_font:{false,true}){
 bool destroyed=false; Families families_; Ptr new_family;
 new_family.reset(new Family{1,42,&destroyed});
 // A previously registered family name can coexist with a unique face/alias
 // from this family. Both registrations store raw pointers in Cobalt.
 Family* unique_face=new_family.get();
 (void)is_duplicate_font;
 OWNERSHIP_BLOCK
 new_family.reset();
 assert(!destroyed);assert(unique_face->face==42);
 families_.data.clear();assert(destroyed);
}}
'''.replace('OWNERSHIP_BLOCK',block)
with tempfile.TemporaryDirectory(prefix='ytaf-font-ownership-') as folder:
 path=Path(folder);(path/'test.cc').write_text(fixture)
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++14','-Wall','-Wextra','-Werror',
                 '-fsanitize=undefined','-fno-sanitize-recover=all',str(path/'test.cc'),'-o',str(path/'test')],check=True)
 subprocess.run([str(path/'test')],check=True)
print('Actual Cobalt font registration retains overlapping families and unique face/alias pointers')
