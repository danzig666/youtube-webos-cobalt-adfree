#!/usr/bin/env python3
"""Run Cobalt's real style insertion and compatibility-mouse methods on host.

Parser, CSP, DOM and event payload boundaries are fixtures. The style insertion,
style processing, mouse mapping and release-to-click methods are extracted from
pinned Cobalt sources, rather than reimplemented as Chrome behavior.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
cobalt = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('method_helper', root / 'scripts/test-external-video-seek.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
style = (cobalt / 'cobalt/dom/html_style_element.cc').read_text()
header = (cobalt / 'cobalt/dom/html_style_element.h').read_text()
assert 'OnMutation()' not in header and 'OnChildNodes' not in header
mouse = (cobalt / 'cobalt/layout/topmost_event_target.cc').read_text()
upclick = helper.method(mouse, '  if (event_init.button() == 0 &&')
fixture = r'''
#include <cassert>
#include <iostream>
#include <memory>
#include <set>
#include <string>
#include <utility>
#include <vector>
#define FROM_HERE 0
struct GURL {explicit GURL(const std::string&) {}};
template<class T>using scoped_refptr=std::shared_ptr<T>;
namespace base {
using Token=std::string;
struct Location {std::string file_path="fixture";};
const std::string& EmptyString(){static std::string value;return value;}
template<class T>struct Optional {T value;T value_or(const T&)const{return value;}};
struct Tokens {
 static std::string pointerdown(){return "pointerdown";}
 static std::string pointerup(){return "pointerup";}
 static std::string pointermove(){return "pointermove";}
 static std::string mousedown(){return "mousedown";}
 static std::string mouseup(){return "mouseup";}
 static std::string mousemove(){return "mousemove";}
 static std::string click(){return "click";}
 static std::string error(){return "error";}
};
}
namespace web {
struct CspDelegate {
 enum ResourceType{kStyle};bool allowed=true;
 bool IsValidNonce(ResourceType,const std::string&){return false;}
 bool AllowInline(ResourceType,const base::Location&,const std::string&){return allowed;}
};
struct Event {bool cancelled=false;bool default_prevented()const{return cancelled;}};
}
namespace cssom {
struct CSSStyleSheet {std::string parsed;
 void SetLocationUrl(const GURL&){}void SetOriginClean(bool){}
};
struct CSSParser {int calls=0;
 scoped_refptr<CSSStyleSheet> ParseStyleSheet(const std::string& text,const base::Location&){
  ++calls;auto sheet=std::make_shared<CSSStyleSheet>();sheet->parsed=text;return sheet;
 }
};
}
struct Context {cssom::CSSParser parser;cssom::CSSParser* css_parser(){return &parser;}};
struct Document {
 Context context;web::CspDelegate csp;unsigned modified=0;bool active=true;
 Context* html_element_context(){return active?&context:nullptr;}
 web::CspDelegate* GetCSPDelegate(){return &csp;}
 void OnStyleSheetsModified(){++modified;}
 void SetIndicatedElement(void*){}
};
struct HTMLElement {
 void OnInsertedIntoDocument(){}void OnRemovedFromDocument(){}
};
struct HTMLStyleElement:HTMLElement {
 Document* doc;std::string text;
 bool is_parser_inserted_=false;unsigned errors=0;
 base::Location inline_style_location_;
 scoped_refptr<cssom::CSSStyleSheet> style_sheet_;
 explicit HTMLStyleElement(Document* document):doc(document){}
 Document* node_document(){return doc;}
 base::Optional<std::string> GetAttribute(const std::string&){return {""};}
 base::Optional<std::string> text_content(){return {text};}
 void PostToDispatchEventName(int,const std::string&){++errors;}
 void Process();void OnInsertedIntoDocument();void OnRemovedFromDocument();
};
STYLE_INSERT
STYLE_REMOVE
STYLE_PROCESS
namespace dom {
using Document=::Document;
struct Window {};
struct PointerEventInit {scoped_refptr<Window> context=std::make_shared<Window>();
 scoped_refptr<Window> view()const{return context;}int button()const{return 0;}
};
struct MouseEvent: web::Event {std::string kind;
 MouseEvent(std::string type,scoped_refptr<Window>,const PointerEventInit&):kind(std::move(type)){}
 const std::string& type()const{return kind;}
};
struct PointerEvent:MouseEvent {std::string device="mouse";
 explicit PointerEvent(std::string type):MouseEvent(std::move(type),nullptr,{}){}
 const std::string& pointer_type()const{return device;}
};
struct HTMLElement {std::vector<std::string> events;Document document;
 void DispatchEvent(MouseEvent* event){events.push_back(event->kind);delete event;}
 Document* node_document(){return &document;}
};
}
MOUSE_MAPPING
void ReleaseClick(const dom::MouseEvent* mouse_event,const dom::PointerEvent* pointer_event,
 scoped_refptr<dom::HTMLElement>& target_element,const dom::PointerEventInit& event_init,
 const scoped_refptr<dom::Window>& view,bool is_touchpad_event=false) {
UP_CLICK
}
int main() {
 Document document;
 HTMLStyleElement old(&document);
 old.OnInsertedIntoDocument(); // 2.6.4 appended an empty style.
 assert(old.style_sheet_ && old.style_sheet_->parsed.empty());
 old.text="span{font-size:60px!important}";
 // Real insertion parsed once: text writes alone do not invoke Process.
 assert(old.style_sheet_->parsed.empty() && document.context.parser.calls==1);
 old.OnRemovedFromDocument();
 HTMLStyleElement populated(&document);populated.text="span{font-size:60px!important}";
 populated.OnInsertedIntoDocument();assert(populated.style_sheet_->parsed==populated.text);
 assert(document.context.parser.calls==2);
 populated.OnRemovedFromDocument();
 HTMLStyleElement changed(&document);changed.text="span{font-size:32px!important}";
 changed.OnInsertedIntoDocument();assert(changed.style_sheet_->parsed==changed.text);
 assert(document.context.parser.calls==3);
 document.csp.allowed=false;
 HTMLStyleElement denied(&document);denied.text="span{font-size:32px}";
 denied.OnInsertedIntoDocument();assert(!denied.style_sheet_ && denied.errors==1);
 std::cout<<"Actual Cobalt style methods: reproduced empty parsed sheet; populated insertion/replacement parse selected CSS; CSP denial stays visible\n";
 auto option=std::make_shared<dom::HTMLElement>();auto underneath=std::make_shared<dom::HTMLElement>();
 dom::PointerEvent down("pointerdown");down.cancelled=true;
 dom::PointerEvent up("pointerup");dom::PointerEventInit event_init;
 std::set<std::string> flags;
 auto event=std::make_shared<web::Event>();event->cancelled=true;
 SendCompatibilityMappingMouseEvent(option,event,&down,event_init,&flags);
 assert(option->events.empty());assert(flags.count("mouse")==1);
 SendCompatibilityMappingMouseEvent(option,event,&up,event_init,&flags);
 assert(option->events.empty());assert(flags.empty());
 // Cobalt emits a click after release despite cancelled pointerdown and no
 // compatibility mousedown/mouseup. An option must accept that click directly.
 auto target=option;ReleaseClick(&up,&up,target,event_init,event_init.view());
 assert(option->events==std::vector<std::string>{"click"});assert(underneath->events.empty());
 dom::PointerEvent move("pointermove");
 SendCompatibilityMappingMouseEvent(option,event,&move,event_init,&flags);
 assert(option->events.back()=="mousemove");
 std::cout<<"Actual Cobalt mouse methods: cancelled down suppresses mouse down/up, release still clicks retained option, movement emits mousemove\n";
}
'''
for marker, value in {
    'STYLE_INSERT': helper.method(style, 'void HTMLStyleElement::OnInsertedIntoDocument('),
    'STYLE_REMOVE': helper.method(style, 'void HTMLStyleElement::OnRemovedFromDocument('),
    'STYLE_PROCESS': helper.method(style, 'void HTMLStyleElement::Process('),
    'MOUSE_MAPPING': helper.method(mouse, 'void SendCompatibilityMappingMouseEvent('),
    'UP_CLICK': upclick,
}.items():
    fixture = fixture.replace(marker, value)
with tempfile.TemporaryDirectory(prefix='ytaf-cobalt-ui-') as folder:
    cpp = Path(folder) / 'ui-semantics.cc'
    binary = Path(folder) / 'ui-semantics'
    cpp.write_text(fixture)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', '-Wall', '-Wextra', '-Werror',
                    '-fsanitize=undefined', '-fno-sanitize-recover=all', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
