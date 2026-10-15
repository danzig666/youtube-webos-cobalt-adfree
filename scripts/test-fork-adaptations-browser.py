"""Exercise new fork adaptations in the shipped preload/main bundles."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML='''<!doctype html><html><head><link rel="stylesheet" href="/adblockMain.css"></head><body>
<ytlr-redux-connect-ytlr-logo-entity id="logo">YouTube</ytlr-redux-connect-ytlr-logo-entity>
<ytlr-tile-renderer id="ad"><ytlr-ad-slot-renderer></ytlr-ad-slot-renderer></ytlr-tile-renderer>
<script>
delete Element.prototype.closest;delete NodeList.prototype.forEach;
let prefs=localStorage.getItem('fixture-prefs')||'';
window.h5vcc={system:{getYtafUiPreferences:()=>prefs,setYtafUiPreferences:v=>{prefs=v;localStorage.setItem('fixture-prefs',v);return true;}}};
window.fixtureNativeProbes=[];
Object.defineProperty(MediaSource,'isTypeSupported',{configurable:true,writable:true,value:function(type){fixtureNativeProbes.push(type);return !/bitrate=[0-9]+\\.[0-9]+/.test(type)&&!/framerate=75/.test(type);}});
</script><script src="/adblockPreload.js"></script><script src="/adblockMain.js"></script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(1280,720),(1920,1080)]:
  context=browser.new_context(viewport={'width':width,'height':height});errors=[]
  def route(request):
   url=urlparse(request.request.url)
   if url.netloc!='test.invalid':request.abort();return
   path=ROOT/'webapp/output'/url.path.lstrip('/')
   if url.path.startswith('/fonts/') or url.path in ['/adblockPreload.js','/adblockMain.js','/adblockMain.css']:
    request.fulfill(body=path.read_bytes(),content_type='text/css' if path.suffix=='.css' else 'font/woff2' if path.suffix=='.woff2' else 'text/javascript')
   else:request.fulfill(body=HTML,content_type='text/html')
  context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://test.invalid/tv#/');page.wait_for_function('window.__ytafUiInitialized')
  page.wait_for_function("document.getElementById('ad').classList.contains('ytaf-hidden-ad-tile')")
  page.evaluate("""()=>{const tile=document.createElement('ytlr-tile-renderer');tile.id='second-ad';tile.appendChild(document.createElement('ytlr-ad-slot-renderer'));document.body.appendChild(tile);}""")
  page.wait_for_function("document.getElementById('second-ad').classList.contains('ytaf-hidden-ad-tile')")
  page.keyboard.press('=');page.wait_for_function("getComputedStyle(document.querySelector('.ytaf-ui-container')).display!=='none'")
  for key in ['hideEndScreens','enhanceThumbnails','hideGuestPrompts','hideYouTubeLogo']:
   page.evaluate("key=>{const node=document.getElementById('__'+key);node.scrollIntoView({block:'center'});node.click();}",key)
   assert page.evaluate('key=>window.__ytafConfigState[key]',key)
  assert page.evaluate("getComputedStyle(document.getElementById('logo')).visibility")=='hidden'
  page.reload();page.wait_for_function('window.__ytafUiInitialized')
  assert page.evaluate("['hideEndScreens','enhanceThumbnails','hideGuestPrompts','hideYouTubeLogo'].every(k=>window.__ytafConfigState[k])")
  assert page.evaluate("getComputedStyle(document.getElementById('logo')).visibility")=='hidden'
  response=page.evaluate('''()=>JSON.parse(JSON.stringify({videoDetails:{videoId:'aaaaaaaaaaa',lengthSeconds:'300'},playabilityStatus:{status:'OK'},endscreen:{endscreenRenderer:{}},playbackTracking:{videostatsWatchtimeUrl:{baseUrl:'history-preserved'}}}))''')
  assert 'endscreen' not in response;assert response['playbackTracking']['videostatsWatchtimeUrl']['baseUrl']=='history-preserved'
  browse=page.evaluate('''()=>JSON.parse(JSON.stringify({contents:{thumbnails:[{url:'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',width:480}],items:[{alertWithActionsRenderer:{title:{simpleText:'Sign in for better recommendations'}}},{alertWithActionsRenderer:{title:{simpleText:'Account error'}}}]}}))''')
  assert browse['contents']['thumbnails'][0]['url'].endswith('/sddefault.jpg');assert len(browse['contents']['items'])==1
  assert browse['contents']['items'][0]['alertWithActionsRenderer']['title']['simpleText']=='Account error'
  assert page.evaluate('''()=>MediaSource.isTypeSupported('video/webm; codecs="vp9"; bitrate=9.25; framerate=60')''')
  assert not page.evaluate('''()=>MediaSource.isTypeSupported('video/webm; codecs="vp9"; bitrate=9.25; framerate=75')''')
  assert page.evaluate('fixtureNativeProbes.length')==4,'Preload/main installed duplicate capability wrappers'
  assert not errors,errors
  print(f'{width}x{height}: actual bundles passed Cobalt DOM omissions, existing/new ad hiding, all four persisted display options, tracking/error preservation, bitrate normalization and unchanged FPS limits',flush=True)
  context.close()
 browser.close()
