"""Exercise Auto startup and its settings using the shipped production bundle.

The player, media clock and API responses are fixtures, not TV measurements.
"""
import ast
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
source=ast.parse((ROOT/'scripts/test-playback-recovery-browser.py').read_text())
HTML=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='html' for t in n.targets))
HTML=HTML.replace("prefs=''", "prefs=localStorage.getItem('quality-prefs')||JSON.stringify({highQualityAutoStartup:true})")
HTML=HTML.replace('prefs=v;return true;', "prefs=v;localStorage.setItem('quality-prefs',v);return true;")
SETUP='''<script>
window.fixtureQuality={id:'aaaaaaaaaaa',preferred:'auto',current:'hd720',levels:['hd1080','auto','hd2160','hd720'],calls:[]};
player.getVideoData=()=>({video_id:fixtureQuality.id});
player.getPreferredQuality=()=>fixtureQuality.preferred;
player.getPlaybackQuality=()=>fixtureQuality.current;
player.getAvailableQualityLevels=()=>fixtureQuality.levels;
player.setPlaybackQualityRange=(min,max)=>{fixtureQuality.calls.push([min,max]);fixtureQuality.preferred=min;};
window.fixtureRemote=code=>{for(const type of ['keydown','keyup'])document.activeElement.dispatchEvent(new KeyboardEvent(type,{keyCode:code,which:code,bubbles:true,cancelable:true}));};
</script>'''
HTML=HTML.replace('<script src="/adblockMain.js">', SETUP+'<script src="/adblockMain.js">')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1280,720),(1920,1080)]:
  context=browser.new_context(viewport={'width':width,'height':height});errors=[]
  def route(req):
   if not req.request.url.startswith('http://test.invalid/'):req.abort();return
   path=req.request.url.split('?',1)[0].split('test.invalid',1)[1]
   file=ROOT/'webapp/output'/path.lstrip('/')
   if path.startswith('/fonts/') or path in ['/adblockMain.js','/adblockMain.css']:
    req.fulfill(body=file.read_bytes(),content_type='font/woff2' if file.suffix=='.woff2' else 'text/css' if file.suffix=='.css' else 'text/javascript')
   else:req.fulfill(body=HTML,content_type='text/html')
  context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://test.invalid/tv#/watch?v=aaaaaaaaaaa');page.evaluate('fixtureAdvance(1000)')
  assert page.evaluate('fixtureQuality.calls')==[['hd2160','hd2160']]
  page.evaluate("fixtureQuality.current='hd2160';fixtureAdvance(250)")
  assert page.evaluate('fixtureQuality.calls')==[['hd2160','hd2160'],['auto','auto']]
  page.evaluate("document.querySelector('video').dispatchEvent(new Event('playing'));fixtureAdvance(500)")
  assert page.evaluate('fixtureQuality.calls.length')==2
  # A new video receives its own attempt; quality never leaks from old timers.
  page.evaluate("""()=>{document.querySelector('video').dispatchEvent(new Event('ended'));fixtureQuality.id='bbbbbbbbbbb';fixtureQuality.current='hd720';location.hash='/watch?v=bbbbbbbbbbb';window.dispatchEvent(new HashChangeEvent('hashchange'));document.querySelector('video').dispatchEvent(new Event('playing'));}""")
  assert page.evaluate('fixtureQuality.calls.at(-1)')==['hd2160','hd2160']
  # Native YouTube selection of the SAME top level must remain manual.
  page.evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));player.setPlaybackQualityRange('hd2160','hd2160');fixtureAdvance(11000)")
  assert page.evaluate('fixtureQuality.preferred')=='hd2160'
  assert page.evaluate('fixtureQuality.calls.at(-1)')==['hd2160','hd2160']
  # Open with the actual GREEN remote code and click the optional setting.
  page.evaluate('fixtureRemote(404);fixtureAdvance(100)')
  page.locator('#__settings_playback').hover()
  control=page.locator('#__high_quality_auto_startup');control.scroll_into_view_if_needed()
  assert control.get_attribute('aria-checked')=='true'
  control.click();assert control.get_attribute('aria-checked')=='false'
  assert not page.evaluate('window.__ytafConfigState.highQualityAutoStartup')
  assert 'briefly request the highest' in page.locator('#__auto_quality_status').inner_text()
  page.reload();page.evaluate('fixtureAdvance(1000)')
  assert not page.evaluate('window.__ytafConfigState.highQualityAutoStartup')
  assert page.evaluate('fixtureQuality.calls')==[]
  assert not errors,errors
  print(f'{width}x{height}: actual bundle passed highest exposed Auto startup, hand-back, once-per-video, new-video isolation, same-quality manual selection, GREEN/cursor settings and durable disable',flush=True)
  context.close()
 browser.close()
